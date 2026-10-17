use crate::{
    api::{self, Result},
    danmaku,
    events::AppEventSink,
    models::*,
    protocol,
};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

#[derive(Clone)]
pub struct AppCore {
    pub api: Arc<api::Api>,
    pub credentials: Arc<RwLock<Option<Credentials>>>,
    pub qr: Arc<Mutex<Option<api::QrSession>>>,
    pub control: Arc<Mutex<()>>,
    pub live_key: Arc<Mutex<Option<String>>>,
    pub connection: Arc<Mutex<Option<danmaku::RoomTask>>>,
}

impl AppCore {
    pub fn new() -> Result<Self> {
        Ok(Self {
            api: Arc::new(api::Api::new()?),
            // 凭据读取失败时不阻塞启动：例如 Linux 上未运行 Secret Service（GNOME Keyring / KWallet）时，
            // 系统凭据库不可用会导致读取报错，此时按"未登录"处理，用户重新扫码即可继续使用。
            credentials: Arc::new(RwLock::new(api::load_credentials().unwrap_or_else(|err| {
                eprintln!("[bili-live] 读取本地登录凭据失败，按未登录状态启动: {err}");
                None
            }))),
            qr: Arc::new(Mutex::new(None)),
            control: Arc::new(Mutex::new(())),
            live_key: Arc::new(Mutex::new(None)),
            connection: Arc::new(Mutex::new(None)),
        })
    }

    pub async fn credentials(&self) -> Result<Credentials> {
        self.credentials
            .read()
            .await
            .clone()
            .ok_or_else(|| "请先扫码登录 B 站账号".into())
    }

    pub async fn get_account(&self) -> Result<Option<Account>> {
        let _control = self.control.lock().await;
        let credentials = self.credentials.read().await.clone();
        match credentials {
            Some(creds) => {
                let account = self.api.account(&creds).await?;
                if account.live_status != 1 {
                    *self.live_key.lock().await = None;
                }
                Ok(Some(account))
            }
            None => Ok(None),
        }
    }

    pub async fn begin_qr_login(&self) -> Result<QrCode> {
        let _control = self.control.lock().await;
        if self.live_key.lock().await.is_some() {
            return Err("请先停止本应用开启的直播，再切换账号".into());
        }
        let (session, qr) = api::QrSession::begin().await?;
        *self.qr.lock().await = Some(session);
        Ok(qr)
    }

    pub async fn poll_qr_login(&self, sink: &AppEventSink, key: &str) -> Result<QrPoll> {
        let _control = self.control.lock().await;
        if self.live_key.lock().await.is_some() {
            return Err("直播中无法切换登录账号".into());
        }
        let mut qr = self.qr.lock().await;
        let session = qr
            .as_ref()
            .filter(|s| s.key == key)
            .ok_or("二维码已被替换，请重新生成")?;
        let (status, credentials) = session.poll().await?;
        let mut account = None;
        if let Some(creds) = credentials {
            account = Some(self.api.account(&creds).await?);
            // 凭据持久化失败不阻断登录：例如 Linux 无可用密钥环时，仍允许本次会话正常使用，
            // 仅在标准错误输出提示，用户下次启动需重新扫码。
            if let Err(err) = api::save_credentials(&creds) {
                eprintln!("[bili-live] 登录凭据无法写入系统凭据库，本次登录不会持久化: {err}");
            }
            if let Some(task) = self.connection.lock().await.take() {
                task.stop().await;
            }
            danmaku::status(sink, "", "disconnected", "登录账号已更新，请重新连接弹幕");
            *self.credentials.write().await = Some(creds);
            *qr = None;
        } else if status == "expired" {
            *qr = None;
        }
        Ok(QrPoll { status, account })
    }

    pub async fn logout(&self, sink: &AppEventSink) -> Result<()> {
        let _control = self.control.lock().await;
        if self.live_key.lock().await.is_some() {
            return Err("请先停止本应用开启的直播，再退出账号".into());
        }
        // 系统凭据库不可用时也允许退出登录：内存中的登录态照常清空，
        // 仅无法删除已持久化的凭据（此时通常本就不存在可删除的记录）。
        if let Err(err) = api::delete_credentials() {
            eprintln!("[bili-live] 清除系统凭据库记录失败: {err}");
        }
        if let Some(task) = self.connection.lock().await.take() {
            task.stop().await;
        }
        danmaku::status(sink, "", "disconnected", "已退出登录并断开弹幕连接");
        *self.credentials.write().await = None;
        *self.qr.lock().await = None;
        Ok(())
    }

    pub async fn get_areas(&self) -> Result<Vec<Area>> {
        self.api.areas().await
    }

    pub async fn get_recent_area(&self) -> Result<RecentArea> {
        self.api.recent_area(&self.credentials().await?).await
    }

    pub async fn start_live(&self, area_id: u64) -> Result<StreamInfo> {
        let _control = self.control.lock().await;
        if self.live_key.lock().await.is_some() {
            return Err("本应用已开启直播，请勿重复开播".into());
        }
        let info = self.api.start(&self.credentials().await?, area_id).await?;
        *self.live_key.lock().await = Some(info.live_key.clone());
        Ok(info)
    }

    pub async fn stop_live(&self, sink: &AppEventSink) -> Result<LiveStats> {
        let _control = self.control.lock().await;
        let creds = self.credentials().await?;
        self.api.stop(&creds).await?;
        let key = self.live_key.lock().await.take();
        let stats = if let Some(key) = key.filter(|k| !k.is_empty()) {
            self.api.stats(&creds, &key).await
        } else {
            Err("缺少本场直播标识（可能由其他软件开播或应用已重启），无法查询统计".into())
        };
        match stats {
            Ok(stats) => Ok(stats),
            Err(warning) => {
                for event in protocol::messages("", &serde_json::json!({"cmd":"PREPARING"})) {
                    sink.emit_message(event);
                }
                Ok(LiveStats {
                    warning: Some(format!("已成功停播，但未取得统计：{warning}")),
                    ..Default::default()
                })
            }
        }
    }

    pub async fn connect_room(&self, sink: &AppEventSink, room_id: &str) -> Result<()> {
        let id = room_id
            .trim()
            .parse::<u64>()
            .map_err(|_| "请输入有效的直播间数字 ID")?;
        if id == 0 {
            return Err("直播间 ID 必须大于 0".into());
        }
        let _control = self.control.lock().await;
        let mut connection = self.connection.lock().await;
        if let Some(task) = connection.take() {
            task.stop().await;
        }
        *connection = Some(danmaku::RoomTask::start(
            sink.clone(),
            id.to_string(),
            self.credentials.read().await.clone(),
        ));
        Ok(())
    }

    pub async fn disconnect_room(&self, sink: &AppEventSink) -> Result<()> {
        let _control = self.control.lock().await;
        if let Some(task) = self.connection.lock().await.take() {
            task.stop().await;
        }
        danmaku::status(sink, "", "disconnected", "弹幕连接已断开");
        Ok(())
    }
}

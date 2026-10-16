use crate::{
    api::{auth, client, data, text, Result, LIVE, UA},
    events::AppEventSink,
    models::{ConnectionStatus, Credentials, RoomOnlineInfo},
    protocol::{self, Incoming},
};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::time::Duration;
use tokio::{sync::watch, task::JoinHandle};
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{
        client::IntoClientRequest, http::HeaderValue, protocol::WebSocketConfig, Message,
    },
};

pub struct RoomTask {
    cancel: watch::Sender<bool>,
    task: JoinHandle<()>,
}
impl RoomTask {
    pub fn start(sink: AppEventSink, room: String, creds: Option<Credentials>) -> Self {
        let (cancel, mut receiver) = watch::channel(false);
        let task = tokio::spawn(async move {
            let mut retries = 0u32;
            loop {
                status(
                    &sink,
                    &room,
                    if retries == 0 {
                        "connecting"
                    } else {
                        "reconnecting"
                    },
                    if retries == 0 {
                        "正在获取弹幕服务器"
                    } else {
                        "连接中断，正在重新获取认证并连接"
                    },
                );
                let result = tokio::select! {
                    _ = receiver.changed() => break,
                    result = run_session(&sink, &room, creds.as_ref(), retries) => result,
                };
                if let Err(message) = result {
                    status(&sink, &room, "reconnecting", &message);
                }
                retries = retries.saturating_add(1);
                let delay = Duration::from_secs((1u64 << retries.min(5)).min(30));
                tokio::select! { _ = receiver.changed() => break, _ = tokio::time::sleep(delay) => {} }
            }
        });
        Self { cancel, task }
    }
    pub async fn stop(self) {
        let _ = self.cancel.send(true);
        let _ = self.task.await;
    }
}
pub fn status(sink: &AppEventSink, room: &str, state: &str, message: &str) {
    sink.emit_status(ConnectionStatus {
        state: state.into(),
        room_id: room.into(),
        message: message.into(),
        popularity: None,
        online: None,
        watched: None,
    });
}
async fn run_session(
    sink: &AppEventSink,
    requested: &str,
    creds: Option<&Credentials>,
    retry: u32,
) -> Result<()> {
    let http = client(None)?;
    let room = data(
        http.get(format!("{LIVE}/room/v1/Room/get_info"))
            .query(&[("room_id", requested)]),
    )
    .await?;
    let room_id = text(&room["room_id"]);
    if room_id.is_empty() || room_id == "0" {
        return Err("直播间不存在".into());
    }
    let mut request = http.get("https://api.bilibili.com/x/web-interface/nav");
    if let Some(c) = creds {
        request = auth(request, c);
    }
    // The nav endpoint returns WBI keys even to guests, with code -101.
    let response: Value = request
        .send()
        .await
        .map_err(|_| "获取弹幕认证信息失败")?
        .error_for_status()
        .map_err(|_| "弹幕认证 HTTP 响应异常")?
        .json()
        .await
        .map_err(|_| "弹幕认证响应格式异常")?;
    let nav = &response["data"];
    let uid = if nav["isLogin"].as_bool() == Some(true) {
        text(&nav["mid"])
    } else {
        "0".into()
    };
    let extract_key = |value: &Value| -> Result<String> {
        let url = reqwest::Url::parse(value.as_str().ok_or("无法获取 WBI 签名密钥")?)
            .map_err(|_| "WBI 密钥格式异常")?;
        let filename = url
            .path_segments()
            .and_then(|mut parts| parts.next_back())
            .ok_or("WBI 密钥为空")?;
        Ok(filename.split('.').next().unwrap_or("").to_string())
    };
    let img = extract_key(&nav["wbi_img"]["img_url"])?;
    let sub = extract_key(&nav["wbi_img"]["sub_url"])?;
    let finger = data(http.get("https://api.bilibili.com/x/frontend/finger/spi")).await?;
    let buvid = text(&finger["b_3"]);
    if buvid.is_empty() {
        return Err("无法获取设备标识，请稍后重试".into());
    }
    let cookies = if let Some(c) = creds {
        format!(
            "SESSDATA={}; bili_jct={}; buvid3={buvid}",
            c.sessdata, c.csrf
        )
    } else {
        format!("buvid3={buvid}")
    };
    let config = data(
        http.get(format!("{LIVE}/xlive/web-room/v1/index/getDanmuInfo"))
            .header("Cookie", cookies)
            .query(&protocol::wbi_params(
                &img,
                &sub,
                &room_id,
                protocol::now() / 1000,
            )),
    )
    .await?;
    let hosts = config["host_list"]
        .as_array()
        .filter(|h| !h.is_empty())
        .ok_or("B 站未返回弹幕服务器")?;
    let host = &hosts[retry as usize % hosts.len()];
    let hostname = host["host"].as_str().ok_or("弹幕服务器地址异常")?;
    if !hostname.ends_with(".chat.bilibili.com") {
        return Err("已拒绝非 B 站弹幕服务器地址".into());
    }
    let port = crate::api::number(&host["wss_port"]);
    if port == 0 || port > 65535 {
        return Err("弹幕服务器端口异常".into());
    }
    let token = config["token"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or("B 站未返回弹幕认证令牌")?;
    let mut request = format!("wss://{hostname}:{port}/sub")
        .into_client_request()
        .map_err(|_| "弹幕连接地址异常")?;
    request
        .headers_mut()
        .insert("User-Agent", HeaderValue::from_static(UA));
    request
        .headers_mut()
        .insert("Origin", HeaderValue::from_static("https://live.bilibili.com"));
    let ws_config = WebSocketConfig::default()
        .max_message_size(Some(8 * 1024 * 1024))
        .max_frame_size(Some(8 * 1024 * 1024));
    let (mut ws, _) = tokio::time::timeout(
        Duration::from_secs(15),
        connect_async_with_config(request, Some(ws_config), false),
    )
    .await
    .map_err(|_| "弹幕连接超时")?
    .map_err(|_| "弹幕连接失败，请检查网络或账号风控状态")?;
    ws.send(Message::Binary(
        protocol::packet(7, &protocol::auth_body(&uid, &room_id, &buvid, token)).into(),
    ))
    .await
    .map_err(|_| "发送弹幕认证失败")?;
    let mut authenticated = false;
    let mut current_popularity: u64 = 0;
    let mut current_online: Option<u64> = None;
    let mut current_watched: Option<String> = None;
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    interval.tick().await;
    let idle = tokio::time::sleep(Duration::from_secs(15));
    tokio::pin!(idle);
    loop {
        tokio::select! {
            _ = &mut idle => return Err(if authenticated { "弹幕服务器响应超时" } else { "弹幕认证超时" }.into()),
            _ = interval.tick(), if authenticated => {
                ws.send(Message::Binary(protocol::packet(2, b"{}").into())).await.map_err(|_| "发送弹幕心跳失败")?;
            }
            message = ws.next() => {
                match message {
                    Some(Ok(Message::Binary(bytes))) => {
                        idle.as_mut().reset(tokio::time::Instant::now() + Duration::from_secs(40));
                        let incoming = tokio::task::spawn_blocking(move || protocol::decode(&bytes)).await.map_err(|_| "弹幕解码任务失败")??;
                        for item in incoming {
                            match item {
                                Incoming::Auth(0) => {
                                    authenticated = true;
                                    status(sink, &room_id, "connected", if uid == "0" { "已连接（游客模式，用户信息可能打码）" } else { "弹幕服务器认证成功" });
                                    ws.send(Message::Binary(protocol::packet(2, b"{}").into())).await.map_err(|_| "发送弹幕心跳失败")?;
                                }
                                Incoming::Auth(_) => return Err("弹幕认证失败，将重新获取令牌；若持续失败请重新登录".into()),
                                Incoming::Heartbeat(popularity) if authenticated => {
                                    current_popularity = popularity;
                                    sink.emit_online(RoomOnlineInfo {
                                        room_id: room_id.clone(),
                                        popularity,
                                        online: current_online,
                                        watched: current_watched.clone(),
                                    });
                                }
                                Incoming::Command(command) if authenticated => {
                                    if let Some((online, watched)) = protocol::extract_online_info(&command) {
                                        if online.is_some() {
                                            current_online = online;
                                        }
                                        if watched.is_some() {
                                            current_watched = watched;
                                        }
                                        sink.emit_online(RoomOnlineInfo {
                                            room_id: room_id.clone(),
                                            popularity: current_popularity,
                                            online: current_online,
                                            watched: current_watched.clone(),
                                        });
                                    }
                                    for event in protocol::messages(&room_id, &command) { sink.emit_message(event); }
                                }
                                _ => {}
                            }
                        }
                    }
                    Some(Ok(Message::Ping(bytes))) => { ws.send(Message::Pong(bytes)).await.map_err(|_| "弹幕连接已断开")?; }
                    Some(Ok(Message::Close(_))) | None => return Err("弹幕服务器关闭了连接".into()),
                    Some(Err(_)) => return Err("弹幕网络连接中断".into()),
                    _ => {}
                }
            }
        }
    }
}

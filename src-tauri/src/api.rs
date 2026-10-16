use crate::models::*;
use base64::Engine;
use image::{DynamicImage, ImageFormat, Luma};
use reqwest::{
    cookie::{CookieStore, Jar},
    Client, RequestBuilder,
};
use serde_json::Value;
use std::{io::Cursor, sync::Arc, time::Duration};

pub type Result<T> = std::result::Result<T, String>;
pub const UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36";
pub const LIVE: &str = "https://api.live.bilibili.com";

pub fn number(v: &Value) -> u64 {
    v.as_u64()
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        .unwrap_or(0)
}
pub fn text(v: &Value) -> String {
    v.as_str().map(str::to_owned).unwrap_or_else(|| {
        if v.is_number() {
            v.to_string()
        } else {
            String::new()
        }
    })
}
pub fn is_bili_domain(host: &str) -> bool {
    host == "bilibili.com"
        || host.ends_with(".bilibili.com")
        || host == "biligame.com"
        || host.ends_with(".biligame.com")
}

pub fn client(jar: Option<Arc<Jar>>) -> Result<Client> {
    let mut builder = Client::builder()
        .user_agent(UA)
        .timeout(Duration::from_secs(15))
        .https_only(true)
        .default_headers({
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(
                reqwest::header::REFERER,
                reqwest::header::HeaderValue::from_static("https://live.bilibili.com/"),
            );
            headers
        })
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                return attempt.error("重定向次数过多");
            }
            let url = attempt.url();
            if url.scheme() == "https" && url.host_str().is_some_and(is_bili_domain) {
                attempt.follow()
            } else {
                attempt.error("已拒绝非 B 站重定向")
            }
        }));
    if let Some(jar) = jar {
        builder = builder.cookie_provider(jar);
    }
    builder.build().map_err(|_| "无法初始化网络客户端".into())
}
pub async fn data(request: RequestBuilder) -> Result<Value> {
    let response = request.send().await.map_err(|e| {
        if e.is_timeout() {
            "请求超时，请稍后重试".to_string()
        } else {
            "网络请求失败，请检查网络连接".to_string()
        }
    })?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("B 站 HTTP 请求失败：{status}"));
    }
    let json: Value = response
        .json()
        .await
        .map_err(|_| "B 站响应格式异常".to_string())?;
    let code = json["code"].as_i64().ok_or("响应缺少状态码")?;
    if code != 0 {
        return Err(format!(
            "B 站接口错误（{code}）：{}",
            json["message"].as_str().unwrap_or("未知错误")
        ));
    }
    Ok(json["data"].clone())
}
pub fn auth(request: RequestBuilder, creds: &Credentials) -> RequestBuilder {
    request.header(
        "Cookie",
        format!("SESSDATA={}; bili_jct={}", creds.sessdata, creds.csrf),
    )
}

pub struct Api {
    pub http: Client,
}
impl Api {
    pub fn new() -> Result<Self> {
        Ok(Self {
            http: client(None)?,
        })
    }
    pub async fn account(&self, creds: &Credentials) -> Result<Account> {
        let nav = data(auth(
            self.http
                .get("https://api.bilibili.com/x/web-interface/nav"),
            creds,
        ))
        .await?;
        if nav["isLogin"].as_bool() != Some(true) {
            return Err("登录已失效，请重新扫码登录".into());
        }
        let uid = text(&nav["mid"]);
        let room = data(auth(
            self.http
                .get(format!("{LIVE}/room/v1/Room/getRoomInfoOld"))
                .query(&[("mid", &uid)]),
            creds,
        ))
        .await?;
        Ok(Account {
            uid,
            uname: text(&nav["uname"]),
            avatar: text(&nav["face"]),
            room_id: text(&room["roomid"]),
            live_status: number(&room["liveStatus"]),
        })
    }
    pub async fn areas(&self) -> Result<Vec<Area>> {
        let value = data(self.http.get(format!("{LIVE}/room/v1/Area/getList"))).await?;
        fn parse(v: &Value) -> Area {
            Area {
                id: number(&v["id"]),
                name: text(&v["name"]),
                children: v["list"]
                    .as_array()
                    .map(|list| list.iter().map(parse).collect())
                    .unwrap_or_default(),
            }
        }
        Ok(value
            .as_array()
            .ok_or("分区列表格式异常")?
            .iter()
            .map(parse)
            .collect())
    }
    pub async fn recent_area(&self, creds: &Credentials) -> Result<RecentArea> {
        let account = self.account(creds).await?;
        let value = data(auth(
            self.http
                .get(format!("{LIVE}/room/v1/Area/getMyChooseArea"))
                .query(&[("roomid", &account.room_id)]),
            creds,
        ))
        .await?;
        let item = value
            .as_array()
            .and_then(|a| a.first())
            .ok_or("暂无上次直播分区，请手动选择")?;
        Ok(RecentArea {
            id: number(&item["id"]),
            name: text(&item["name"]),
        })
    }
    pub async fn start(&self, creds: &Credentials, area: u64) -> Result<StreamInfo> {
        if area == 0 {
            return Err("请选择直播子分区".into());
        }
        let account = self.account(creds).await?;
        if account.room_id.is_empty() || account.room_id == "0" {
            return Err("当前账号尚未开通直播间，请先在 B 站开通".into());
        }
        let value = data(
            auth(
                self.http.post(format!("{LIVE}/room/v1/Room/startLive")),
                creds,
            )
            .header("platform", "web_electron_link")
            .form(&[
                ("room_id", account.room_id),
                ("area_v2", area.to_string()),
                ("csrf", creds.csrf.clone()),
                ("csrf_token", creds.csrf.clone()),
                ("platform", "pc_link".into()),
            ]),
        )
        .await?;
        let addr = text(&value["rtmp"]["addr"]);
        let code = text(&value["rtmp"]["code"]);
        if addr.is_empty() || code.is_empty() {
            return Err("开播接口未返回推流信息；请刷新直播状态并检查 B 站直播权限".into());
        }
        Ok(StreamInfo {
            addr,
            code,
            live_key: text(&value["live_key"]),
        })
    }
    pub async fn stop(&self, creds: &Credentials) -> Result<()> {
        let account = self.account(creds).await?;
        data(
            auth(
                self.http.post(format!("{LIVE}/room/v1/Room/stopLive")),
                creds,
            )
            .form(&[
                ("room_id", account.room_id),
                ("csrf", creds.csrf.clone()),
                ("csrf_token", creds.csrf.clone()),
                ("platform", "web_electron_link".into()),
            ]),
        )
        .await?;
        Ok(())
    }
    pub async fn stats(&self, creds: &Credentials, key: &str) -> Result<LiveStats> {
        let value = data(auth(
            self.http
                .get(format!("{LIVE}/xlive/app-blink/v1/live/StopLiveData"))
                .query(&[("live_key", key)]),
            creds,
        ))
        .await?;
        Ok(LiveStats {
            available: true,
            warning: None,
            add_fans: number(&value["AddFans"]),
            danmu_num: number(&value["DanmuNum"]),
            hamster_rmb: number(&value["HamsterRmb"]),
            live_time: number(&value["LiveTime"]),
            max_online: number(&value["MaxOnline"]),
            new_fans_club: number(&value["NewFansClub"]),
            watched_count: number(&value["WatchedCount"]),
        })
    }
}

pub struct QrSession {
    pub key: String,
    http: Client,
    jar: Arc<Jar>,
}
impl QrSession {
    pub async fn begin() -> Result<(Self, QrCode)> {
        let jar = Arc::new(Jar::default());
        let http = client(Some(jar.clone()))?;
        let value =
            data(http.get("https://passport.bilibili.com/x/passport-login/web/qrcode/generate"))
                .await?;
        let url = text(&value["url"]);
        let key = text(&value["qrcode_key"]);
        if url.is_empty() || key.is_empty() {
            return Err("生成登录二维码失败".into());
        }
        let qr = qrcode::QrCode::new(url.as_bytes()).map_err(|_| "无法编码二维码")?;
        let image = qr.render::<Luma<u8>>().min_dimensions(256, 256).build();
        let mut bytes = Cursor::new(Vec::new());
        DynamicImage::ImageLuma8(image)
            .write_to(&mut bytes, ImageFormat::Png)
            .map_err(|_| "生成二维码图片失败")?;
        let image = format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes.into_inner())
        );
        Ok((
            Self {
                key: key.clone(),
                http,
                jar,
            },
            QrCode { url, key, image },
        ))
    }
    pub async fn poll(&self) -> Result<(String, Option<Credentials>)> {
        let value = data(
            self.http
                .get("https://passport.bilibili.com/x/passport-login/web/qrcode/poll")
                .query(&[("qrcode_key", &self.key)]),
        )
        .await?;
        match number(&value["code"]) {
            86101 => Ok(("waiting".into(), None)),
            86090 => Ok(("scanned".into(), None)),
            86038 => Ok(("expired".into(), None)),
            0 => {
                let url_str = text(&value["url"]);
                let mut sessdata = String::new();
                let mut csrf = String::new();

                if !url_str.is_empty() {
                    let parsed = reqwest::Url::parse(&url_str).map_err(|_| "登录回调地址异常")?;
                    let host = parsed.host_str().unwrap_or("");
                    if parsed.scheme() != "https" || !is_bili_domain(host) {
                        return Err(format!("登录回调域名异常: {host}"));
                    }

                    // 1. 优先从回调 URL 的查询参数提取 SESSDATA 和 bili_jct
                    for (k, v) in parsed.query_pairs() {
                        if k == "SESSDATA" && sessdata.is_empty() {
                            sessdata = v.to_string();
                        } else if (k == "bili_jct" || k == "csrf") && csrf.is_empty() {
                            csrf = v.to_string();
                        }
                    }

                    // 2. 访问 crossDomain URL 完成跨域打 Cookie
                    let _ = self.http.get(parsed).send().await;
                }

                // 3. 从 Cookie jar 补充提取
                if sessdata.is_empty() || csrf.is_empty() {
                    for domain in &[
                        "https://www.bilibili.com/",
                        "https://bilibili.com/",
                        "https://passport.bilibili.com/",
                    ] {
                        if let Ok(u) = reqwest::Url::parse(domain) {
                            let cookies = self
                                .jar
                                .cookies(&u)
                                .and_then(|c| c.to_str().ok().map(str::to_owned))
                                .unwrap_or_default();
                            if sessdata.is_empty() {
                                sessdata = cookie_value(&cookies, "SESSDATA");
                            }
                            if csrf.is_empty() {
                                csrf = cookie_value(&cookies, "bili_jct");
                            }
                            if !sessdata.is_empty() && !csrf.is_empty() {
                                break;
                            }
                        }
                    }
                }

                if sessdata.is_empty() || csrf.is_empty() {
                    return Err("登录成功但未获取到完整凭据，请重新扫码".into());
                }
                Ok(("success".into(), Some(Credentials { sessdata, csrf })))
            }
            _ => Err("扫码登录返回未知状态，请重新生成二维码".into()),
        }
    }
}
fn cookie_value(cookies: &str, name: &str) -> String {
    cookies
        .split(';')
        .find_map(|part| {
            part.trim()
                .split_once('=')
                .filter(|(key, _)| *key == name)
                .map(|(_, value)| value.to_string())
        })
        .unwrap_or_default()
}

pub fn credential_entry() -> Result<keyring::Entry> {
    keyring::Entry::new("com.bililive.desktop", "bilibili-session")
        .map_err(|_| "无法访问系统凭据管理器".into())
}
pub fn load_credentials() -> Result<Option<Credentials>> {
    match credential_entry()?.get_password() {
        Ok(value) => serde_json::from_str(&value).map(Some).map_err(|_| {
            "本地登录凭据损坏，请从系统凭据管理器删除 com.bililive.desktop 后重试".into()
        }),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("无法读取系统保存的登录凭据".into()),
    }
}
pub fn save_credentials(creds: &Credentials) -> Result<()> {
    credential_entry()?
        .set_password(&serde_json::to_string(creds).map_err(|_| "凭据序列化失败")?)
        .map_err(|_| "无法安全保存登录凭据".into())
}
pub fn delete_credentials() -> Result<()> {
    match credential_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("删除系统登录凭据失败".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cookie_matching_is_exact() {
        assert_eq!(
            cookie_value("OTHERSESSDATA=no; SESSDATA=a=b; bili_jct=c", "SESSDATA"),
            "a=b"
        );
        assert_eq!(cookie_value("", "bili_jct"), "");
    }
    #[test]
    fn mixed_number_types() {
        assert_eq!(number(&serde_json::json!("42")), 42);
        assert_eq!(number(&serde_json::json!(42)), 42);
    }
    #[test]
    fn domain_whitelist_validates_correctly() {
        assert!(is_bili_domain("bilibili.com"));
        assert!(is_bili_domain("passport.bilibili.com"));
        assert!(is_bili_domain("biligame.com"));
        assert!(is_bili_domain("passport.biligame.com"));
        assert!(!is_bili_domain("evilbilibili.com"));
        assert!(!is_bili_domain("evil.com"));
    }
}

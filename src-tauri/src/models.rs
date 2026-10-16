use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct Credentials {
    pub sessdata: String,
    pub csrf: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub uid: String,
    pub uname: String,
    pub room_id: String,
    pub avatar: String,
    pub live_status: u64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct QrCode {
    pub url: String,
    pub key: String,
    pub image: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct QrPoll {
    pub status: String,
    pub account: Option<Account>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Area {
    pub id: u64,
    pub name: String,
    pub children: Vec<Area>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct RecentArea {
    pub id: u64,
    pub name: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    pub addr: String,
    pub code: String,
    pub live_key: String,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveStats {
    pub available: bool,
    pub warning: Option<String>,
    pub add_fans: u64,
    pub danmu_num: u64,
    pub hamster_rmb: u64,
    pub live_time: u64,
    pub max_online: u64,
    pub new_fans_club: u64,
    pub watched_count: u64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatus {
    pub state: String,
    pub room_id: String,
    pub message: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveMessage {
    pub id: String,
    pub room_id: String,
    pub kind: String,
    pub user: String,
    pub uid: String,
    pub text: String,
    pub timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quantity: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub medal: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "event", content = "payload")]
pub enum ServerEvent {
    #[serde(rename = "connection-status")]
    ConnectionStatus(ConnectionStatus),
    #[serde(rename = "live-message")]
    LiveMessage(LiveMessage),
}

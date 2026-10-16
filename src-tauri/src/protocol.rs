use crate::{
    api::{number, text, Result},
    models::LiveMessage,
};
use base64::Engine;
use prost::Message;
use serde_json::{json, Value};
use std::{
    io::Read,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_DECODED: usize = 8 * 1024 * 1024;
const MAX_PACKETS: usize = 4096;
static SEQUENCE: AtomicU64 = AtomicU64::new(0);
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn packet(operation: u32, body: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(body.len() + 16);
    bytes.extend_from_slice(&((body.len() + 16) as u32).to_be_bytes());
    bytes.extend_from_slice(&16u16.to_be_bytes());
    bytes.extend_from_slice(&1u16.to_be_bytes());
    bytes.extend_from_slice(&operation.to_be_bytes());
    bytes.extend_from_slice(&1u32.to_be_bytes());
    bytes.extend_from_slice(body);
    bytes
}

#[derive(Debug)]
pub enum Incoming {
    Auth(i64),
    Command(Value),
    Heartbeat(u64),
}
pub fn decode(bytes: &[u8]) -> Result<Vec<Incoming>> {
    let mut result = Vec::new();
    let mut budget = MAX_DECODED;
    decode_inner(bytes, 0, &mut budget, &mut result)?;
    Ok(result)
}
fn decode_inner(
    bytes: &[u8],
    depth: usize,
    budget: &mut usize,
    out: &mut Vec<Incoming>,
) -> Result<()> {
    if depth > 4 || bytes.len() > *budget {
        return Err("弹幕包超过安全解码限制".into());
    }
    *budget -= bytes.len();
    let mut offset = 0;
    while offset < bytes.len() {
        if out.len() >= MAX_PACKETS {
            return Err("弹幕消息数量超过限制".into());
        }
        let remaining = &bytes[offset..];
        if remaining.len() < 16 {
            return Err("弹幕包头不完整".into());
        }
        let length = u32::from_be_bytes(remaining[0..4].try_into().unwrap()) as usize;
        let header = u16::from_be_bytes(remaining[4..6].try_into().unwrap()) as usize;
        let version = u16::from_be_bytes(remaining[6..8].try_into().unwrap());
        let op = u32::from_be_bytes(remaining[8..12].try_into().unwrap());
        if header < 16 || length < header || length > remaining.len() {
            return Err("弹幕包长度异常".into());
        }
        let body = &remaining[header..length];
        match op {
            8 => {
                let value: Value =
                    serde_json::from_slice(body).map_err(|_| "弹幕认证响应格式异常")?;
                out.push(Incoming::Auth(value["code"].as_i64().unwrap_or(-1)));
            }
            3 => {
                let popularity = if body.len() >= 4 {
                    u32::from_be_bytes(body[0..4].try_into().unwrap_or([0, 0, 0, 0])) as u64
                } else {
                    0
                };
                out.push(Incoming::Heartbeat(popularity));
            }
            5 if version == 2 || version == 3 => {
                let reader: Box<dyn Read + '_> = if version == 2 {
                    Box::new(flate2::read::ZlibDecoder::new(body))
                } else {
                    Box::new(brotli::Decompressor::new(body, 4096))
                };
                let mut decoded = Vec::new();
                reader
                    .take((*budget + 1) as u64)
                    .read_to_end(&mut decoded)
                    .map_err(|_| "弹幕压缩包解码失败")?;
                decode_inner(&decoded, depth + 1, budget, out)?;
            }
            5 if (version == 0 || version == 1) && !body.is_empty() => {
                out.push(Incoming::Command(
                    serde_json::from_slice(body).map_err(|_| "弹幕 JSON 格式异常")?,
                ));
            }
            _ => {}
        }
        offset += length;
    }
    Ok(())
}

#[derive(Clone, PartialEq, Message)]
struct Interact {
    #[prost(uint64, tag = "1")]
    uid: u64,
    #[prost(string, tag = "2")]
    uname: String,
    #[prost(uint64, tag = "5")]
    msg_type: u64,
}
#[derive(Clone, PartialEq, Message)]
struct GiftItem {
    #[prost(string, tag = "2")]
    name: String,
    #[prost(uint64, tag = "3")]
    num: u64,
    #[prost(uint64, tag = "7")]
    total_coin: u64,
    #[prost(string, tag = "8")]
    coin_type: String,
}
#[derive(Clone, PartialEq, Message)]
struct GiftBroadcast {
    #[prost(uint64, tag = "1")]
    uid: u64,
    #[prost(string, tag = "2")]
    uname: String,
    #[prost(message, repeated, tag = "10")]
    gifts: Vec<GiftItem>,
}
fn interact_label(kind: u64) -> &'static str {
    match kind {
        1 => "进入直播间",
        2 => "关注了主播",
        3 => "分享了直播间",
        4 => "特别关注了主播",
        5 => "与主播互粉",
        6 => "为主播点赞",
        _ => "参与了互动",
    }
}
pub fn extract_online_info(command: &Value) -> Option<(Option<u64>, Option<String>)> {
    let cmd = command["cmd"]
        .as_str()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("");
    let d = &command["data"];
    match cmd {
        "ONLINE_RANK_COUNT" => {
            let count = number(&d["count"]);
            Some((Some(count), None))
        }
        "WATCHED_CHANGE" => {
            let watched = text(&d["text_large"]);
            let watched_str = if watched.is_empty() {
                let n = number(&d["num"]);
                if n > 0 { Some(format!("累计观看 {n}")) } else { None }
            } else {
                Some(watched)
            };
            Some((None, watched_str))
        }
        _ => None,
    }
}

pub fn messages(room: &str, command: &Value) -> Vec<LiveMessage> {
    let cmd = command["cmd"]
        .as_str()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("");
    let d = &command["data"];
    let make = |kind: &str,
                user: String,
                uid: String,
                content: String,
                amount: Option<f64>,
                quantity: Option<u64>,
                medal: Option<String>,
                avatar: Option<String>,
                emots: Option<std::collections::HashMap<String, String>>| LiveMessage {
        id: format!("{}-{}", now(), SEQUENCE.fetch_add(1, Ordering::Relaxed)),
        room_id: room.into(),
        kind: kind.into(),
        user,
        uid,
        text: content,
        timestamp: now(),
        amount,
        quantity,
        medal,
        avatar,
        emots,
    };
    let event = match cmd {
        "DANMU_MSG" | "DANMU_MSG_MIRROR" => {
            let i = &command["info"];
            let medal = text(&i[3][1]);
            let danmaku_text = text(&i[1]);

            // 提取表情映射
            let mut emots_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();

            // 单个表情包弹幕
            if let Some(url) = i[0][13]["url"].as_str() {
                if !url.is_empty() {
                    emots_map.insert(danmaku_text.clone(), url.to_string());
                }
            }

            // 从 extra 字符串解析用户头像和混合表情字典
            let mut avatar: Option<String> = None;
            let extra_str = i[0][15]["extra"].as_str().or_else(|| i[0][15].as_str());
            if let Some(extra_s) = extra_str {
                if let Ok(extra_val) = serde_json::from_str::<Value>(extra_s) {
                    if let Some(face) = extra_val["user"]["base"]["face"].as_str() {
                        if !face.is_empty() {
                            avatar = Some(face.to_string());
                        }
                    }
                    if let Some(emots_obj) = extra_val["emots"].as_object() {
                        for (k, v) in emots_obj {
                            if let Some(u) = v["url"].as_str() {
                                if !u.is_empty() {
                                    emots_map.insert(k.clone(), u.to_string());
                                }
                            }
                        }
                    }
                }
            }

            // 兜底头像
            if avatar.is_none() {
                let face = text(&i[0][15]["user"]["base"]["face"]);
                if !face.is_empty() {
                    avatar = Some(face);
                }
            }

            make(
                "danmaku",
                text(&i[2][1]),
                text(&i[2][0]),
                danmaku_text,
                None,
                None,
                (!medal.is_empty()).then_some(medal),
                avatar,
                (!emots_map.is_empty()).then_some(emots_map),
            )
        }
        "SEND_GIFT" => {
            let face = text(&d["face"]);
            make(
                "gift",
                text(&d["uname"]),
                text(&d["uid"]),
                format!("赠送 {} × {}", text(&d["giftName"]), number(&d["num"])),
                (d["coin_type"] == "gold").then(|| number(&d["total_coin"]) as f64 / 1000.0),
                Some(number(&d["num"])),
                None,
                (!face.is_empty()).then_some(face),
                None,
            )
        }
        "SEND_GIFT_V2" => {
            if let Some(proto) = d["pb"]
                .as_str()
                .and_then(|s| base64::engine::general_purpose::STANDARD.decode(s).ok())
                .and_then(|bytes| GiftBroadcast::decode(bytes.as_slice()).ok())
            {
                let face = text(&d["face"]);
                let avatar = (!face.is_empty()).then_some(face);
                return proto
                    .gifts
                    .iter()
                    .map(|g| {
                        make(
                            "gift",
                            proto.uname.clone(),
                            proto.uid.to_string(),
                            format!("赠送 {} × {}", g.name, g.num),
                            (g.coin_type == "gold").then_some(g.total_coin as f64 / 1000.0),
                            Some(g.num),
                            None,
                            avatar.clone(),
                            None,
                        )
                    })
                    .collect();
            }
            return vec![];
        }
        "GUARD_BUY" | "USER_TOAST_MSG_V2" => {
            if cmd == "USER_TOAST_MSG_V2" && number(&d["source"]) == 2 {
                return vec![];
            }
            let level = match number(&d["guard_level"]) {
                1 => "总督",
                2 => "提督",
                _ => "舰长",
            };
            let f1 = text(&d["user_info"]["face"]);
            let face = if !f1.is_empty() { f1 } else { text(&d["face"]) };
            make(
                "guard",
                text(&d["username"]),
                text(&d["uid"]),
                format!("开通 {level}"),
                None,
                Some(number(&d["num"])),
                None,
                (!face.is_empty()).then_some(face),
                None,
            )
        }
        "SUPER_CHAT_MESSAGE" => {
            let f1 = text(&d["user_info"]["face"]);
            let face = if !f1.is_empty() { f1 } else { text(&d["user_info"]["user_face"]) };
            make(
                "superchat",
                text(&d["user_info"]["uname"]),
                text(&d["uid"]),
                text(&d["message"]),
                Some(number(&d["price"]) as f64),
                None,
                None,
                (!face.is_empty()).then_some(face),
                None,
            )
        }
        "SUPER_CHAT_MESSAGE_DELETE" => make(
            "superchat-delete",
            "系统".into(),
            String::new(),
            format!("醒目留言已删除：{}", d["ids"]),
            None,
            None,
            None,
            None,
            None,
        ),
        "INTERACT_WORD_V2" => {
            if let Some(proto) = d["pb"]
                .as_str()
                .and_then(|s| base64::engine::general_purpose::STANDARD.decode(s).ok())
                .and_then(|bytes| Interact::decode(bytes.as_slice()).ok())
            {
                make(
                    "interact",
                    proto.uname,
                    proto.uid.to_string(),
                    interact_label(proto.msg_type).into(),
                    None,
                    None,
                    None,
                    None,
                    None,
                )
            } else {
                return vec![];
            }
        }
        "INTERACT_WORD" => {
            let f1 = text(&d["face"]);
            let face = if !f1.is_empty() { f1 } else { text(&d["uinfo"]["base"]["face"]) };
            make(
                "interact",
                text(&d["uname"]),
                text(&d["uid"]),
                interact_label(number(&d["msg_type"])).into(),
                None,
                None,
                None,
                (!face.is_empty()).then_some(face),
                None,
            )
        }
        "LIKE_INFO_V3_CLICK" => {
            let f1 = text(&d["face"]);
            let face = if !f1.is_empty() { f1 } else { text(&d["uinfo"]["base"]["face"]) };
            make(
                "interact",
                text(&d["uname"]),
                text(&d["uid"]),
                "为主播点赞".into(),
                None,
                None,
                None,
                (!face.is_empty()).then_some(face),
                None,
            )
        }
        "LIVE" => make(
            "notice",
            "系统".into(),
            String::new(),
            "直播间已开播".into(),
            None,
            None,
            None,
            None,
            None,
        ),
        "PREPARING" => make(
            "notice",
            "系统".into(),
            String::new(),
            "直播间已下播".into(),
            None,
            None,
            None,
            None,
            None,
        ),
        "WATCHED_CHANGE" => make(
            "notice",
            "系统".into(),
            String::new(),
            format!("累计观看：{}", number(&d["num"])),
            None,
            None,
            None,
            None,
            None,
        ),
        _ => return vec![],
    };
    vec![event]
}

// WBI request signing: keys are permuted according to the web API protocol.
pub fn wbi_params(
    img_key: &str,
    sub_key: &str,
    room: &str,
    timestamp: u64,
) -> Vec<(String, String)> {
    const INDEX: [usize; 32] = [
        46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19,
        29, 28, 14, 39, 12, 38, 41, 13,
    ];
    let source = format!("{img_key}{sub_key}");
    let key: String = INDEX
        .iter()
        .filter_map(|i| source.as_bytes().get(*i).map(|b| *b as char))
        .collect();
    let mut params = vec![
        ("id".into(), room.to_string()),
        ("type".into(), "0".into()),
        ("wts".into(), timestamp.to_string()),
    ];
    let mut url = reqwest::Url::parse("https://api.bilibili.com/").unwrap();
    url.query_pairs_mut().extend_pairs(&params);
    let signature = format!(
        "{:x}",
        md5::compute(format!("{}{key}", url.query().unwrap_or("")))
    );
    params.push(("w_rid".into(), signature));
    params
}
pub fn auth_body(uid: &str, room: &str, buvid: &str, token: &str) -> Vec<u8> {
    serde_json::to_vec(&json!({"uid":uid.parse::<u64>().unwrap_or(0),"roomid":room.parse::<u64>().unwrap_or(0),"protover":3,"platform":"web","type":2,"buvid":buvid,"key":token})).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn business(body: &[u8]) -> Vec<u8> {
        let mut p = packet(5, body);
        p[6..8].copy_from_slice(&0u16.to_be_bytes());
        p
    }
    #[test]
    fn parses_multiple_packets() {
        let mut p = packet(8, br#"{"code":0}"#);
        p.extend(business(br#"{"cmd":"LIVE"}"#));
        assert_eq!(decode(&p).unwrap().len(), 2);
    }
    #[test]
    fn malformed_lengths_rejected() {
        let mut p = packet(5, b"{}");
        p[0..4].copy_from_slice(&0u32.to_be_bytes());
        assert!(decode(&p).is_err());
        assert!(decode(&[0; 8]).is_err());
    }
    #[test]
    fn parses_compressed_packets() {
        use std::io::Write;
        let inner = business(br#"{"cmd":"LIVE"}"#);
        let mut z = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        z.write_all(&inner).unwrap();
        let mut p = packet(5, &z.finish().unwrap());
        p[6..8].copy_from_slice(&2u16.to_be_bytes());
        assert_eq!(decode(&p).unwrap().len(), 1);
        let mut compressed = Vec::new();
        {
            let mut b = brotli::CompressorWriter::new(&mut compressed, 4096, 5, 22);
            b.write_all(&inner).unwrap();
        }
        let mut p = packet(5, &compressed);
        p[6..8].copy_from_slice(&3u16.to_be_bytes());
        assert_eq!(decode(&p).unwrap().len(), 1);
    }
    #[test]
    fn uid_keeps_integer_precision() {
        let m = messages(
            "1",
            &json!({"cmd":"DANMU_MSG:4:0:2","info":[[],"hello",[9007199254740993u64,"观众"],[]]}),
        );
        assert_eq!(m[0].uid, "9007199254740993");
        assert_eq!(m[0].text, "hello");
    }
    #[test]
    fn protobuf_gifts_and_interactions() {
        let pb = GiftBroadcast {
            uid: 1,
            uname: "观众".into(),
            gifts: vec![GiftItem {
                name: "礼物".into(),
                num: 2,
                total_coin: 2000,
                coin_type: "gold".into(),
            }],
        };
        let encoded = base64::engine::general_purpose::STANDARD.encode(pb.encode_to_vec());
        let m = messages("1", &json!({"cmd":"SEND_GIFT_V2","data":{"pb":encoded}}));
        assert_eq!(m[0].amount, Some(2.0));
        let encoded = base64::engine::general_purpose::STANDARD.encode(
            Interact {
                uid: 1,
                uname: "观众".into(),
                msg_type: 2,
            }
            .encode_to_vec(),
        );
        assert_eq!(
            messages(
                "1",
                &json!({"cmd":"INTERACT_WORD_V2","data":{"pb":encoded}})
            )[0]
            .text,
            "关注了主播"
        );
    }
    #[test]
    fn unknown_events_are_ignored() {
        assert!(messages("1", &json!({"cmd":"UNKNOWN"})).is_empty());
    }
}

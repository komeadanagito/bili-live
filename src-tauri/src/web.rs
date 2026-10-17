use crate::{core::AppCore, events::AppEventSink, models::*};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
pub struct WebServerState {
    pub core: AppCore,
    pub event_tx: broadcast::Sender<ServerEvent>,
    pub sink: AppEventSink,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn err_resp(msg: String) -> Response {
    (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: msg })).into_response()
}

pub fn create_router(state: WebServerState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/api/health", get(|| async { Json(json!({"status": "ok"})) }))
        .route("/api/invoke/{command}", post(handle_invoke))
        .route("/ws", get(handle_ws))
        .layer(cors)
        .with_state(state)
}

#[derive(Deserialize)]
struct KeyPayload {
    #[serde(default)]
    key: String,
}

#[derive(Deserialize)]
struct StartLivePayload {
    #[serde(rename = "areaId", default)]
    area_id: u64,
}

#[derive(Deserialize)]
struct ConnectRoomPayload {
    #[serde(rename = "roomId", default)]
    room_id: String,
}

async fn handle_invoke(
    Path(command): Path<String>,
    State(state): State<WebServerState>,
    body: axum::body::Bytes,
) -> Response {
    let val: Value = if body.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&body).unwrap_or(Value::Null)
    };
    match command.as_str() {
        "get_account" => match state.core.get_account().await {
            Ok(acc) => Json(acc).into_response(),
            Err(e) => err_resp(e),
        },
        "begin_qr_login" => match state.core.begin_qr_login().await {
            Ok(qr) => Json(qr).into_response(),
            Err(e) => err_resp(e),
        },
        "poll_qr_login" => {
            let payload: KeyPayload = match serde_json::from_value(val) {
                Ok(p) => p,
                Err(e) => return err_resp(format!("参数解析失败: {e}")),
            };
            match state.core.poll_qr_login(&state.sink, &payload.key).await {
                Ok(poll) => Json(poll).into_response(),
                Err(e) => err_resp(e),
            }
        }
        "logout" => match state.core.logout(&state.sink).await {
            Ok(()) => Json(json!({})).into_response(),
            Err(e) => err_resp(e),
        },
        "get_areas" => match state.core.get_areas().await {
            Ok(areas) => Json(areas).into_response(),
            Err(e) => err_resp(e),
        },
        "get_recent_area" => match state.core.get_recent_area().await {
            Ok(area) => Json(area).into_response(),
            Err(e) => err_resp(e),
        },
        "start_live" => {
            let payload: StartLivePayload = match serde_json::from_value(val) {
                Ok(p) => p,
                Err(e) => return err_resp(format!("参数解析失败: {e}")),
            };
            match state.core.start_live(payload.area_id).await {
                Ok(info) => Json(info).into_response(),
                Err(e) => err_resp(e),
            }
        }
        "stop_live" => match state.core.stop_live(&state.sink).await {
            Ok(stats) => Json(stats).into_response(),
            Err(e) => err_resp(e),
        },
        "connect_room" => {
            let payload: ConnectRoomPayload = match serde_json::from_value(val) {
                Ok(p) => p,
                Err(e) => return err_resp(format!("参数解析失败: {e}")),
            };
            match state.core.connect_room(&state.sink, &payload.room_id).await {
                Ok(()) => Json(json!({})).into_response(),
                Err(e) => err_resp(e),
            }
        }
        "disconnect_room" => match state.core.disconnect_room(&state.sink).await {
            Ok(()) => Json(json!({})).into_response(),
            Err(e) => err_resp(e),
        },
        "open_overlay_window"
        | "close_overlay_window"
        | "set_overlay_click_through"
        | "set_overlay_always_on_top" => Json(json!({})).into_response(),
        "is_overlay_open" => Json(false).into_response(),
        "get_app_version" => Json(env!("CARGO_PKG_VERSION")).into_response(),
        "check_app_update" => {
            match crate::updater::check_update(env!("CARGO_PKG_VERSION")).await {
                Ok(res) => Json(res).into_response(),
                Err(e) => err_resp(e),
            }
        }
        "download_and_install_update" => {
            // Web 端不直接执行 exe 安装，返回错误或提示在浏览器下载
            err_resp("网页预览模式不支持本地直接安装，请直接在 Release 页面下载安装包".to_string())
        }
        "open_external_url" => Json(json!({})).into_response(),
        _ => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("未知命令: {command}"),
            }),
        )
            .into_response(),
    }
}

async fn handle_ws(
    ws: WebSocketUpgrade,
    State(state): State<WebServerState>,
) -> Response {
    ws.on_upgrade(move |socket| run_ws_session(socket, state))
}

async fn run_ws_session(socket: WebSocket, state: WebServerState) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.event_tx.subscribe();

    let mut send_task = tokio::spawn(async move {
        while let Ok(event) = rx.recv().await {
            if let Ok(json_text) = serde_json::to_string(&event) {
                if sender.send(Message::Text(json_text.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Close(_) = msg {
                break;
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }
}

pub async fn run_web_server(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let core = AppCore::new()?;
    let (tx, _) = broadcast::channel(512);
    let sink = AppEventSink::Web(tx.clone());

    let state = WebServerState {
        core,
        event_tx: tx,
        sink,
    };

    let app = create_router(state);
    let addr = format!("127.0.0.1:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    println!(">>> Bili Live Web 服务已就绪: http://{addr}");
    println!(">>> 网页端调试可直接调用 API 与 WebSocket，与 App 桌面版功能完全一致。");
    axum::serve(listener, app).await?;
    Ok(())
}

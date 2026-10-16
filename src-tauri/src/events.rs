use crate::models::{ConnectionStatus, LiveMessage, RoomOnlineInfo, ServerEvent};
use tauri::Emitter;
use tokio::sync::broadcast;

#[derive(Clone)]
pub enum AppEventSink {
    Tauri(tauri::AppHandle),
    Web(broadcast::Sender<ServerEvent>),
    Dual {
        app: tauri::AppHandle,
        web: broadcast::Sender<ServerEvent>,
    },
}

impl AppEventSink {
    pub fn emit_status(&self, status: ConnectionStatus) {
        match self {
            AppEventSink::Tauri(app) => {
                let _ = app.emit("connection-status", status);
            }
            AppEventSink::Web(tx) => {
                let _ = tx.send(ServerEvent::ConnectionStatus(status));
            }
            AppEventSink::Dual { app, web } => {
                let _ = app.emit("connection-status", status.clone());
                let _ = web.send(ServerEvent::ConnectionStatus(status));
            }
        }
    }

    pub fn emit_message(&self, message: LiveMessage) {
        match self {
            AppEventSink::Tauri(app) => {
                let _ = app.emit("live-message", message);
            }
            AppEventSink::Web(tx) => {
                let _ = tx.send(ServerEvent::LiveMessage(message));
            }
            AppEventSink::Dual { app, web } => {
                let _ = app.emit("live-message", message.clone());
                let _ = web.send(ServerEvent::LiveMessage(message));
            }
        }
    }

    pub fn emit_online(&self, online: RoomOnlineInfo) {
        match self {
            AppEventSink::Tauri(app) => {
                let _ = app.emit("room-online", online);
            }
            AppEventSink::Web(tx) => {
                let _ = tx.send(ServerEvent::RoomOnline(online));
            }
            AppEventSink::Dual { app, web } => {
                let _ = app.emit("room-online", online.clone());
                let _ = web.send(ServerEvent::RoomOnline(online));
            }
        }
    }
}

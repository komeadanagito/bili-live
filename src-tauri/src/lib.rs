pub mod api;
pub mod core;
pub mod danmaku;
pub mod events;
pub mod models;
pub mod protocol;
pub mod web;

use api::Result;
use models::*;
use tauri::{Manager, State};

pub struct AppState {
    pub core: core::AppCore,
    pub sink: events::AppEventSink,
}

#[tauri::command]
async fn get_account(state: State<'_, AppState>) -> Result<Option<Account>> {
    state.core.get_account().await
}

#[tauri::command]
async fn begin_qr_login(state: State<'_, AppState>) -> Result<QrCode> {
    state.core.begin_qr_login().await
}

#[tauri::command]
async fn poll_qr_login(key: String, state: State<'_, AppState>) -> Result<QrPoll> {
    state.core.poll_qr_login(&state.sink, &key).await
}

#[tauri::command]
async fn logout(state: State<'_, AppState>) -> Result<()> {
    state.core.logout(&state.sink).await
}

#[tauri::command]
async fn get_areas(state: State<'_, AppState>) -> Result<Vec<Area>> {
    state.core.get_areas().await
}

#[tauri::command]
async fn get_recent_area(state: State<'_, AppState>) -> Result<RecentArea> {
    state.core.get_recent_area().await
}

#[tauri::command]
async fn start_live(area_id: u64, state: State<'_, AppState>) -> Result<StreamInfo> {
    state.core.start_live(area_id).await
}

#[tauri::command]
async fn stop_live(state: State<'_, AppState>) -> Result<LiveStats> {
    state.core.stop_live(&state.sink).await
}

#[tauri::command]
async fn connect_room(room_id: String, state: State<'_, AppState>) -> Result<()> {
    state.core.connect_room(&state.sink, &room_id).await
}

#[tauri::command]
async fn disconnect_room(state: State<'_, AppState>) -> Result<()> {
    state.core.disconnect_room(&state.sink).await
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let core = core::AppCore::new().map_err(std::io::Error::other)?;
            let sink = events::AppEventSink::Tauri(app.handle().clone());
            app.manage(AppState { core, sink });

            // 强制将窗口与任务栏图标设为粉色小电视 (同步立即设置 + 异步延时再次确认覆盖)
            let icon_bytes = include_bytes!("../icons/128x128.png");
            if let Ok(img) = image::load_from_memory(icon_bytes) {
                let rgba = img.to_rgba8();
                let (width, height) = rgba.dimensions();
                let icon_data = rgba.into_raw();
                let icon = tauri::image::Image::new_owned(icon_data.clone(), width, height);
                for (_, win) in app.webview_windows() {
                    let _ = win.set_icon(icon.clone());
                }

                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                    if let Some(win) = handle.get_webview_window("main") {
                        let icon_retry = tauri::image::Image::new_owned(icon_data, width, height);
                        let _ = win.set_icon(icon_retry);
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_account,
            begin_qr_login,
            poll_qr_login,
            logout,
            get_areas,
            get_recent_area,
            start_live,
            stop_live,
            connect_room,
            disconnect_room
        ])
        .run(tauri::generate_context!())
        .expect("无法启动 Bili Live 桌面应用");
}

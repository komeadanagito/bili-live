pub mod api;
pub mod core;
pub mod danmaku;
pub mod events;
pub mod models;
pub mod protocol;
pub mod updater;
pub mod web;

use api::Result;
use models::*;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, State};

static OVERLAY_PINNED: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
mod cursor_pos {
    #[repr(C)]
    #[derive(Default, Copy, Clone)]
    pub struct POINT {
        pub x: i32,
        pub y: i32,
    }

    extern "system" {
        pub fn GetCursorPos(lpPoint: *mut POINT) -> i32;
    }

    pub fn get_mouse_pos() -> Option<(i32, i32)> {
        let mut pt = POINT::default();
        let ret = unsafe { GetCursorPos(&mut pt) };
        if ret != 0 {
            Some((pt.x, pt.y))
        } else {
            None
        }
    }
}

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

#[tauri::command]
async fn open_overlay_window(app: tauri::AppHandle, theme: Option<String>) -> std::result::Result<(), String> {
    use tauri::Manager;
    OVERLAY_PINNED.store(false, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        let _ = win.set_ignore_cursor_events(false);
        if let Some(t) = theme {
            use tauri::Emitter;
            let _ = win.emit("theme-changed", t);
        }
        return Ok(());
    }

    let url = tauri::WebviewUrl::App("/#overlay".into());
    let builder = tauri::WebviewWindowBuilder::new(&app, "overlay", url)
        .title("Bili Live · 实时互动悬浮窗")
        .inner_size(360.0, 560.0)
        .min_inner_size(240.0, 260.0)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .shadow(false)
        .resizable(true);

    let win = builder.build().map_err(|e| e.to_string())?;

    let icon_bytes = include_bytes!("../icons/128x128.png");
    if let Ok(img) = image::load_from_memory(icon_bytes) {
        let rgba = img.to_rgba8();
        let (width, height) = rgba.dimensions();
        let icon_data = rgba.into_raw();
        let icon = tauri::image::Image::new_owned(icon_data, width, height);
        let _ = win.set_icon(icon);
    }

    if let Some(t) = theme {
        let win_clone = win.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(350)).await;
            use tauri::Emitter;
            let _ = win_clone.emit("theme-changed", t);
        });
    }

    Ok(())
}

#[tauri::command]
async fn close_overlay_window(app: tauri::AppHandle) -> std::result::Result<(), String> {
    use tauri::Manager;
    OVERLAY_PINNED.store(false, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window("overlay") {
        let _ = win.close();
    }
    Ok(())
}

#[tauri::command]
async fn set_overlay_pinned(app: tauri::AppHandle, pinned: bool) -> std::result::Result<(), String> {
    use tauri::Manager;
    OVERLAY_PINNED.store(pinned, Ordering::SeqCst);

    let Some(win) = app.get_webview_window("overlay") else {
        return Ok(());
    };

    if !pinned {
        // 解除固定：确保取消穿透，恢复窗口自由移动与操作
        let _ = win.set_always_on_top(true);
        let _ = win.set_ignore_cursor_events(false);
        return Ok(());
    }

    // 开启固定模式：
    let _ = win.set_always_on_top(true);
    let _ = win.set_ignore_cursor_events(true);

    #[cfg(target_os = "windows")]
    {
        let win_clone = win.clone();
        tauri::async_runtime::spawn(async move {
            let mut is_ignoring = true;

            while OVERLAY_PINNED.load(Ordering::SeqCst) {
                // 窗口关闭则退出
                let Ok(is_visible) = win_clone.is_visible() else {
                    break;
                };
                if !is_visible {
                    break;
                }

                if let Some((mx, my)) = cursor_pos::get_mouse_pos() {
                    let pos = win_clone.outer_position().unwrap_or_default();
                    let size = win_clone.outer_size().unwrap_or_default();
                    let scale = win_clone.scale_factor().unwrap_or(1.0);

                    // 右上角图钉按钮物理屏幕热区 (宽约 54px，高约 44px)
                    let btn_w = (54.0 * scale) as i32;
                    let btn_h = (44.0 * scale) as i32;

                    let pin_x_min = pos.x + size.width as i32 - btn_w;
                    let pin_x_max = pos.x + size.width as i32;
                    let pin_y_min = pos.y;
                    let pin_y_max = pos.y + btn_h;

                    let in_pin_btn = mx >= pin_x_min && mx <= pin_x_max && my >= pin_y_min && my <= pin_y_max;

                    if in_pin_btn {
                        // 鼠标位于图钉区域：解除穿透，允许鼠标点击图钉解锁移动
                        if is_ignoring {
                            let _ = win_clone.set_ignore_cursor_events(false);
                            is_ignoring = false;
                        }
                    } else if !is_ignoring && OVERLAY_PINNED.load(Ordering::SeqCst) {
                        // 鼠标位于悬浮窗其它内容区或窗口外：保持穿透，支持操作背景内容
                        let _ = win_clone.set_ignore_cursor_events(true);
                        is_ignoring = true;
                    }
                }

                tokio::time::sleep(std::time::Duration::from_millis(30)).await;
            }

            let _ = win_clone.set_ignore_cursor_events(false);
        });
    }

    Ok(())
}

#[tauri::command]
async fn set_overlay_click_through(app: tauri::AppHandle, ignore: bool) -> std::result::Result<(), String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("overlay") {
        win.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn set_overlay_always_on_top(app: tauri::AppHandle, always_on_top: bool) -> std::result::Result<(), String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("overlay") {
        win.set_always_on_top(always_on_top).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn is_overlay_open(app: tauri::AppHandle) -> std::result::Result<bool, String> {
    use tauri::Manager;
    Ok(app.get_webview_window("overlay").is_some())
}

#[tauri::command]
async fn check_app_update(app: tauri::AppHandle) -> std::result::Result<updater::UpdateCheckResult, String> {
    let current_version = app.package_info().version.to_string();
    updater::check_update(&current_version).await
}

#[tauri::command]
async fn download_and_install_update(
    app: tauri::AppHandle,
    download_url: String,
    asset_name: Option<String>,
) -> std::result::Result<(), String> {
    updater::download_and_install_update(app, download_url, asset_name).await
}

#[tauri::command]
async fn get_app_version(app: tauri::AppHandle) -> std::result::Result<String, String> {
    Ok(app.package_info().version.to_string())
}

#[tauri::command]
async fn open_external_url(url: String) -> std::result::Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
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
            disconnect_room,
            open_overlay_window,
            close_overlay_window,
            set_overlay_pinned,
            set_overlay_click_through,
            set_overlay_always_on_top,
            is_overlay_open,
            check_app_update,
            download_and_install_update,
            get_app_version,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("无法启动 Bili Live 桌面应用");
}

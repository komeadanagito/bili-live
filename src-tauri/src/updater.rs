use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

const GITHUB_REPO: &str = "komeadanagito/bili-live";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_name: String,
    pub release_notes: String,
    pub download_url: Option<String>,
    pub asset_name: Option<String>,
    pub asset_size: Option<u64>,
    pub release_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percent: f64,
    pub finished: bool,
}

#[derive(Deserialize)]
struct GithubReleaseAsset {
    name: String,
    size: u64,
    browser_download_url: String,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    #[serde(default)]
    assets: Vec<GithubReleaseAsset>,
}

/// 语义化版本解析并对比：若 latest > current 返回 true
fn is_newer_version(latest: &str, current: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        let clean = v.trim().trim_start_matches(|c| c == 'v' || c == 'V');
        let parts: Vec<&str> = clean.split(|c: char| c == '.' || c == '-').collect();
        parts
            .into_iter()
            .take(3)
            .filter_map(|s| s.parse::<u64>().ok())
            .collect()
    };

    let l = parse(latest);
    let c = parse(current);

    if l.is_empty() {
        return false;
    }

    for (a, b) in l.iter().zip(c.iter()) {
        if a > b {
            return true;
        }
        if a < b {
            return false;
        }
    }

    l.len() > c.len()
}

/// 各平台默认安装包文件名（当 Release 未附对应资源时用作兜底命名）
#[cfg(target_os = "windows")]
const DEFAULT_ASSET_NAME: &str = "bili_live_setup_latest.exe";
#[cfg(target_os = "macos")]
const DEFAULT_ASSET_NAME: &str = "bili_live_latest.dmg";
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
const DEFAULT_ASSET_NAME: &str = "bili_live_latest.AppImage";

/// 按当前平台从 Release 资源中挑选安装包
///
/// - Windows：优先含 setup 的 .exe，其次任意 .exe
/// - macOS：.dmg
/// - Linux：优先 AppImage（免安装、可原地升级），其次 .deb，再次 .rpm
#[cfg(target_os = "windows")]
fn pick_asset(assets: &[GithubReleaseAsset]) -> Option<&GithubReleaseAsset> {
    let lower = |a: &GithubReleaseAsset| a.name.to_lowercase();
    assets
        .iter()
        .find(|a| lower(a).ends_with(".exe") && lower(a).contains("setup"))
        .or_else(|| assets.iter().find(|a| lower(a).ends_with(".exe")))
}

#[cfg(target_os = "macos")]
fn pick_asset(assets: &[GithubReleaseAsset]) -> Option<&GithubReleaseAsset> {
    assets
        .iter()
        .find(|a| a.name.to_lowercase().ends_with(".dmg"))
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn pick_asset(assets: &[GithubReleaseAsset]) -> Option<&GithubReleaseAsset> {
    let lower = |a: &GithubReleaseAsset| a.name.to_lowercase();
    assets
        .iter()
        .find(|a| lower(a).ends_with(".appimage"))
        .or_else(|| assets.iter().find(|a| lower(a).ends_with(".deb")))
        .or_else(|| assets.iter().find(|a| lower(a).ends_with(".rpm")))
}

pub async fn check_update(current_version: &str) -> Result<UpdateCheckResult, String> {
    let url = format!("https://api.github.com/repos/{}/releases/latest", GITHUB_REPO);

    let client = reqwest::Client::builder()
        .user_agent(format!("bili-live-desktop/{}", current_version))
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("构建网络客户端失败: {e}"))?;

    let res = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/vnd.github.v3+json")
        .send()
        .await;

    let res = match res {
        Ok(r) => r,
        Err(e) => {
            return Err(format!("无法连接 GitHub 检查更新: {e}"));
        }
    };

    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(UpdateCheckResult {
            current_version: current_version.to_string(),
            latest_version: current_version.to_string(),
            has_update: false,
            release_name: "暂无发布版本".to_string(),
            release_notes: "GitHub 仓库暂未发布新版本 Release".to_string(),
            download_url: None,
            asset_name: None,
            asset_size: None,
            release_url: format!("https://github.com/{}/releases", GITHUB_REPO),
        });
    }

    if !res.status().is_success() {
        return Err(format!("GitHub API 响应异常: HTTP {}", res.status()));
    }

    let release = res
        .json::<GithubRelease>()
        .await
        .map_err(|e| format!("解析 Release 信息失败: {e}"))?;

    let latest_ver = release.tag_name.trim().trim_start_matches(|c| c == 'v' || c == 'V').to_string();
    let has_update = is_newer_version(&latest_ver, current_version);

    // 按当前平台挑选安装包资源（Windows 用 setup.exe / Linux 用 AppImage 或 deb / macOS 用 dmg）
    let asset = pick_asset(&release.assets);

    Ok(UpdateCheckResult {
        current_version: current_version.to_string(),
        latest_version: latest_ver,
        has_update,
        release_name: release.name.unwrap_or_else(|| release.tag_name.clone()),
        release_notes: release.body.unwrap_or_default(),
        download_url: asset.map(|a| a.browser_download_url.clone()),
        asset_name: asset.map(|a| a.name.clone()),
        asset_size: asset.map(|a| a.size),
        release_url: release.html_url,
    })
}

pub async fn download_and_install_update(
    app: AppHandle,
    download_url: String,
    asset_name: Option<String>,
) -> Result<(), String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("创建下载客户端失败: {e}"))?;

    let res = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("请求安装包下载链接失败: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("下载安装包失败: HTTP {}", res.status()));
    }

    let total = res.content_length().unwrap_or(0);
    let filename = asset_name.unwrap_or_else(|| DEFAULT_ASSET_NAME.to_string());
    let temp_path: PathBuf = std::env::temp_dir().join(&filename);

    let mut file = tokio::fs::File::create(&temp_path)
        .await
        .map_err(|e| format!("无法创建临时安装文件: {e}"))?;

    let mut stream = res.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit_percent = -1.0;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("下载中断: {e}"))?;
        downloaded += chunk.len() as u64;

        file.write_all(&chunk)
            .await
            .map_err(|e| format!("写入安装文件失败: {e}"))?;

        let percent = if total > 0 {
            ((downloaded as f64 / total as f64) * 100.0 * 10.0).round() / 10.0
        } else {
            0.0
        };

        if percent - last_emit_percent >= 0.5 || downloaded == total {
            last_emit_percent = percent;
            let _ = app.emit(
                "update-download-progress",
                UpdateProgress {
                    downloaded,
                    total,
                    percent,
                    finished: false,
                },
            );
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("保存安装文件失败: {e}"))?;
    drop(file);

    let _ = app.emit(
        "update-download-progress",
        UpdateProgress {
            downloaded,
            total,
            percent: 100.0,
            finished: true,
        },
    );

    // 调起安装程序并退出当前程序（Windows：直接运行 NSIS 安装包）
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new(&temp_path)
            .spawn()
            .map_err(|e| format!("启动安装程序失败: {e}"))?;

        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(800)).await;
            app_handle.exit(0);
        });
        Ok(())
    }

    // macOS：打开 dmg 由用户拖拽安装
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&temp_path)
            .spawn()
            .map_err(|e| format!("打开安装包失败: {e}"))?;
        Ok(())
    }

    // Linux：AppImage 支持原地覆盖升级，deb / rpm 交给系统默认处理程序
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        install_linux_update(&app, &temp_path, &filename)
    }
}

/// 用新文件替换目标文件：优先原子重命名，跨文件系统（如 /tmp 为 tmpfs）时回退为复制后删除
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn replace_file(source: &std::path::Path, target: &std::path::Path) -> std::io::Result<()> {
    match std::fs::rename(source, target) {
        Ok(()) => Ok(()),
        Err(_) => {
            std::fs::copy(source, target)?;
            let _ = std::fs::remove_file(source);
            Ok(())
        }
    }
}

/// Linux 安装流程
///
/// 1. 若下载的是 AppImage：补上可执行权限；当程序本身以 AppImage 方式运行（存在 `$APPIMAGE`）时，
///    直接把新文件覆盖到旧文件上并重启，实现"一键原地升级"。
/// 2. 其余情况（deb / rpm 等）：调用 `xdg-open` 交由系统软件中心或包管理器处理。
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn install_linux_update(
    app: &AppHandle,
    downloaded: &std::path::Path,
    filename: &str,
) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let is_appimage = filename.to_lowercase().ends_with(".appimage");

    if is_appimage {
        if let Ok(meta) = std::fs::metadata(downloaded) {
            let mut perm = meta.permissions();
            perm.set_mode(0o755);
            let _ = std::fs::set_permissions(downloaded, perm);
        }

        // 当前正以 AppImage 运行：覆盖旧文件后重启，自动切换到新版本
        if let Ok(current) = std::env::var("APPIMAGE") {
            if !current.is_empty() {
                let target = PathBuf::from(&current);
                if let Err(e) = replace_file(downloaded, &target) {
                    return Err(format!(
                        "覆盖旧版本失败（{e}），新版本已保存到 {}，请手动替换",
                        downloaded.display()
                    ));
                }

                let app_handle = app.clone();
                let restart_path = target.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = std::process::Command::new(&restart_path).spawn();
                    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
                    app_handle.exit(0);
                });
                return Ok(());
            }
        }
    }

    let opened = std::process::Command::new("xdg-open")
        .arg(downloaded)
        .spawn()
        .is_ok();

    if opened {
        Ok(())
    } else {
        Err(format!(
            "新版本已下载到 {}，请手动安装（未检测到 xdg-open）",
            downloaded.display()
        ))
    }
}

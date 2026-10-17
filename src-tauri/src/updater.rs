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

    // 寻找 exe 格式的安装文件 (优先选择包含 setup 或 x64 的)
    let exe_asset = release
        .assets
        .iter()
        .find(|a| a.name.to_lowercase().ends_with(".exe") && a.name.to_lowercase().contains("setup"))
        .or_else(|| release.assets.iter().find(|a| a.name.to_lowercase().ends_with(".exe")));

    Ok(UpdateCheckResult {
        current_version: current_version.to_string(),
        latest_version: latest_ver,
        has_update,
        release_name: release.name.unwrap_or_else(|| release.tag_name.clone()),
        release_notes: release.body.unwrap_or_default(),
        download_url: exe_asset.map(|a| a.browser_download_url.clone()),
        asset_name: exe_asset.map(|a| a.name.clone()),
        asset_size: exe_asset.map(|a| a.size),
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
    let filename = asset_name.unwrap_or_else(|| "bili_live_setup_latest.exe".to_string());
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

    // 调起安装程序并退出当前程序
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

    #[cfg(not(target_os = "windows"))]
    {
        Err(format!("已下载到: {}，请手动打开安装", temp_path.display()))
    }
}

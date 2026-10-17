import { useState, useEffect, useCallback } from 'react';
import {
  User,
  RefreshCw,
  LogOut,
  Copy,
  Check,
  KeyRound,
  LogIn,
  Sun,
  Moon,
  Download,
  ExternalLink,
  Sparkles,
  Loader2,
} from 'lucide-react';
import type { Account, ConnectionStatus, Theme } from '../types';
import {
  getAppVersion,
  checkAppUpdate,
  downloadAndInstallUpdate,
  onUpdateProgress,
  openExternalUrl,
  type UpdateCheckResult,
  type UpdateProgress,
} from '../bridge';

interface Props {
  account: Account | null;
  live: boolean;
  disabled: boolean;
  busy: string;
  connection: ConnectionStatus;
  copied: string;
  theme: Theme;
  onSetTheme: (theme: Theme) => void;
  onCopy: (text: string, name: string) => void;
  onOpenLogin: () => void;
  onRefreshAccount: () => void;
  onLogoutConfirm: () => void;
  onNotify?: (msg: string) => void;
  onError?: (msg: string) => void;
}

export default function AccountView({
  account,
  live,
  disabled,
  busy,
  connection,
  copied,
  theme,
  onSetTheme,
  onCopy,
  onOpenLogin,
  onRefreshAccount,
  onLogoutConfirm,
  onNotify,
  onError,
}: Props) {
  const [currentVersion, setCurrentVersion] = useState('0.1.2');
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<UpdateProgress | null>(null);

  useEffect(() => {
    getAppVersion().then(v => {
      if (v) setCurrentVersion(v);
    }).catch(() => {});
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    if (checking || downloading) return;
    setChecking(true);
    onNotify?.('正在检查是否有新版本...');
    try {
      const res = await checkAppUpdate();
      setUpdateInfo(res);
      if (res.has_update) {
        onNotify?.(`发现新版本 v${res.latest_version}，可立即更新安装。`);
      } else {
        onNotify?.(`当前已是最新版本 (v${res.latest_version || currentVersion})。`);
      }
    } catch (err: any) {
      onError?.(err?.message || '检查更新失败，请稍后重试。');
    } finally {
      setChecking(false);
    }
  }, [checking, downloading, currentVersion, onNotify, onError]);

  const handleInstallUpdate = useCallback(async () => {
    if (!updateInfo) return;
    if (!updateInfo.download_url) {
      if (updateInfo.release_url) {
        await openExternalUrl(updateInfo.release_url);
      }
      return;
    }

    setDownloading(true);
    setDownloadProgress({
      downloaded: 0,
      total: updateInfo.asset_size || 0,
      percent: 0,
      finished: false,
    });
    onNotify?.('开始下载新版本安装包，请稍候...');

    let unlisten: (() => void) | undefined;
    try {
      unlisten = await onUpdateProgress((progress) => {
        setDownloadProgress(progress);
        if (progress.finished) {
          onNotify?.('新版本安装包已下载完成，正在启动安装向导...');
        }
      });

      await downloadAndInstallUpdate(updateInfo.download_url, updateInfo.asset_name);
    } catch (err: any) {
      onError?.(err?.message || '下载安装包失败，请尝试在浏览器手动下载。');
      setDownloading(false);
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  }, [updateInfo, onNotify, onError]);
  return (
    <div className="view-container account-view">
      <div className="account-grid">
        {/* Left Column: Account Details Card */}
        <section className="card account-profile-card">
          <div className="card-header">
            <div className="card-title-group">
              <h3>主播认证</h3>
            </div>
            {account && (
              <span className="status-pill connected-pill">
                <span className="signal-dot connected" />
                <span>已授权登录</span>
              </span>
            )}
          </div>

          <div className="account-card-body">
            {account ? (
              <div className="profile-content">
                <div className="profile-hero">
                  <div className="profile-avatar-large">
                    {account.avatar ? (
                      <img src={account.avatar} alt={account.uname} referrerPolicy="no-referrer" />
                    ) : (
                      <span>{account.uname.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="profile-hero-info">
                    <h2 className="profile-uname">{account.uname}</h2>
                    <div className="profile-badges">
                      <span className="badge-tag">UID: {account.uid}</span>
                      <span className={`badge-tag ${live ? 'badge-tag-live' : ''}`}>
                        {live ? '直播中' : '未开播'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="profile-meta-table">
                  <div className="meta-row">
                    <span className="meta-key">绑定直播间号</span>
                    <span className="meta-val">
                      <code>{account.roomId && account.roomId !== '0' ? account.roomId : '未开通'}</code>
                      {account.roomId && account.roomId !== '0' && (
                        <button
                          className="btn-copy-chip"
                          onClick={() => onCopy(account.roomId, 'room')}
                          aria-label="复制直播间号"
                        >
                          {copied === 'room' ? <Check size={12} /> : <Copy size={12} />}
                          <span>{copied === 'room' ? '已复制' : '复制'}</span>
                        </button>
                      )}
                    </span>
                  </div>

                  <div className="meta-row">
                    <span className="meta-key">直播间状态</span>
                    <span className="meta-val">
                      <span className={`status-text ${live ? 'text-live' : 'text-idle'}`}>
                        {live ? '开播中' : '未开播'}
                      </span>
                    </span>
                  </div>

                  <div className="meta-row">
                    <span className="meta-key">长链接当前挂载房间</span>
                    <span className="meta-val">
                      <code>{connection.roomId || '未接入'}</code>
                    </span>
                  </div>
                </div>

                <div className="profile-actions-row">
                  <button
                    className="action-pill-btn"
                    disabled={disabled}
                    onClick={onRefreshAccount}
                    aria-label="刷新账号状态"
                  >
                    <RefreshCw className={busy === 'refresh' ? 'spin' : ''} size={15} />
                    <span className="action-pill-label">{busy === 'refresh' ? '刷新中…' : '刷新状态'}</span>
                  </button>

                  <button
                    className="action-pill-btn"
                    disabled={disabled}
                    onClick={onOpenLogin}
                    aria-label="切换账号"
                  >
                    <KeyRound size={15} />
                    <span className="action-pill-label">切换账号</span>
                  </button>

                  <button
                    className="action-pill-btn action-pill-danger"
                    disabled={disabled}
                    onClick={onLogoutConfirm}
                    aria-label="退出当前账号"
                  >
                    <LogOut size={15} />
                    <span className="action-pill-label">退出账号</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="unauth-box">
                <div className="unauth-symbol">
                  <User size={38} />
                </div>
                <h3>未登录哔哩哔哩账号</h3>
                <p>登录后可直接获取绑定的直播间推流地址与密钥，管理直播状态。</p>
                <button className="btn btn-primary" onClick={onOpenLogin}>
                  <LogIn size={15} />
                  <span>扫码安全登录</span>
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Theme Selection & System Info */}
        <div className="account-right-stack">
          {/* Theme Selection Card */}
          <section className="card theme-select-card">
            <div className="card-header">
              <div className="card-title-group">
                <h3>界面视觉主题</h3>
              </div>
              <span className="status-pill idle-pill">
                {theme === 'pink-light' ? '白粉液态玻璃' : '黑浅蓝液态玻璃'}
              </span>
            </div>

            <div className="theme-card-body">
              <div className="theme-options-grid">
                <button
                  type="button"
                  className={`theme-choice-card ${theme === 'pink-light' ? 'choice-active' : ''}`}
                  onClick={() => onSetTheme('pink-light')}
                >
                  <div className="theme-preview-box preview-pink">
                    <div className="preview-line" />
                    <div className="preview-block" />
                  </div>
                  <div className="theme-meta">
                    <div className="theme-title">
                      <Sun size={14} />
                      <strong>白粉液态玻璃</strong>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  className={`theme-choice-card ${theme === 'dark' ? 'choice-active' : ''}`}
                  onClick={() => onSetTheme('dark')}
                >
                  <div className="theme-preview-box preview-dark">
                    <div className="preview-line" />
                    <div className="preview-block" />
                  </div>
                  <div className="theme-meta">
                    <div className="theme-title">
                      <Moon size={14} />
                      <strong>黑浅蓝液态玻璃</strong>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </section>

          {/* Version and Update Control */}
          <div className="account-version-card">
            <div className="version-card-main">
              <div className="version-info-left">
                <span className="version-name">Bili Live Studio</span>
                <span className="version-pill">v{currentVersion}</span>
                {updateInfo?.has_update && (
                  <span className="version-new-badge">
                    <Sparkles size={11} />
                    <span>发现新版本 v{updateInfo.latest_version}</span>
                  </span>
                )}
              </div>

              <div className="version-actions-right">
                <button
                  type="button"
                  className={`btn-check-update ${checking ? 'is-checking' : ''}`}
                  onClick={handleCheckUpdate}
                  disabled={checking || downloading}
                  title="刷新检测最新版本"
                >
                  <RefreshCw size={12} className={checking ? 'spin-anim' : ''} />
                  <span>{checking ? '检查中...' : '检查更新'}</span>
                </button>

                {updateInfo?.release_url && (
                  <button
                    type="button"
                    className="btn-version-link"
                    onClick={() => openExternalUrl(updateInfo.release_url)}
                    title="在 GitHub 打开 Release 页面"
                  >
                    <ExternalLink size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* 新版本详情与一键安装卡片 */}
            {updateInfo?.has_update && !downloading && (
              <div className="version-update-panel">
                <div className="version-update-header">
                  <div className="version-update-meta">
                    <strong>{updateInfo.release_name || `版本更新 v${updateInfo.latest_version}`}</strong>
                    {updateInfo.asset_size && (
                      <span className="version-asset-size">
                        {(updateInfo.asset_size / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-install-update"
                    onClick={handleInstallUpdate}
                  >
                    <Download size={13} />
                    <span>立即更新并安装</span>
                  </button>
                </div>

                {updateInfo.release_notes ? (
                  <div className="version-notes-box">
                    <div className="version-notes-title">更新说明：</div>
                    <div className="version-notes-text">{updateInfo.release_notes}</div>
                  </div>
                ) : null}
              </div>
            )}

            {/* 下载进度面板 */}
            {downloading && (
              <div className="version-download-panel">
                <div className="download-status-row">
                  <div className="download-status-title">
                    <Loader2 size={13} className="spin-anim" />
                    <span>
                      {downloadProgress?.finished
                        ? '下载完成，正在启动安装向导...'
                        : `正在下载安装包... ${(downloadProgress?.percent ?? 0).toFixed(1)}%`}
                    </span>
                  </div>
                  <span className="download-bytes-text">
                    {downloadProgress && downloadProgress.total > 0
                      ? `${(downloadProgress.downloaded / (1024 * 1024)).toFixed(1)} MB / ${(downloadProgress.total / (1024 * 1024)).toFixed(1)} MB`
                      : ''}
                  </span>
                </div>
                <div className="download-progress-track">
                  <div
                    className="download-progress-bar"
                    style={{ width: `${Math.min(100, Math.max(2, downloadProgress?.percent ?? 0))}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

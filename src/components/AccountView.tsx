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
} from 'lucide-react';
import type { Account, ConnectionStatus, Theme } from '../types';

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
}: Props) {
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

          {/* Version Note */}
          <div className="account-version-badge">
            <span>Bili Live Studio • v0.1.0-alpha</span>
          </div>
        </div>
      </div>
    </div>
  );
}

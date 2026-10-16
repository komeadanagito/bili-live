import { useState, useRef, useEffect } from 'react';
import { LogIn, RefreshCw, Wifi, WifiOff, LogOut, Sun, Moon, Radio } from 'lucide-react';
import type { Account, ConnectionStatus, Theme } from '../types';

interface Props {
  account: Account | null;
  loading: boolean;
  disabled: boolean;
  live: boolean;
  connection: ConnectionStatus;
  theme: Theme;
  onToggleTheme: () => void;
  onOpenLogin: () => void;
  onRefreshAccount: () => void;
  onLogoutConfirm: () => void;
  onJumpToAccount: () => void;
}

export default function Header({
  account,
  loading,
  disabled,
  live,
  connection,
  theme,
  onToggleTheme,
  onOpenLogin,
  onRefreshAccount,
  onLogoutConfirm,
  onJumpToAccount,
}: Props) {
  const isRoomConnected = connection.state === 'connected';

  const connectionText = {
    connected: connection.roomId ? `房间 ${connection.roomId} 已连接` : '长链接已连接',
    connecting: '正在建立连接…',
    reconnecting: '正在尝试重连…',
    error: '弹幕连接异常',
    disconnected: '弹幕未连接',
  }[connection.state];

  return (
    <header className="app-header">
      <div className="header-status-group">
        {/* Dynamic Live Broadcast Pill */}
        <DynamicStatusPill
          triggerKey={live}
          statusClass={live ? 'pill-live' : 'pill-idle'}
          icon={
            live ? (
              <span className="live-indicator-wrap">
                <span className="signal-dot pulse" />
              </span>
            ) : (
              <Radio size={14} className="status-icon-dim" />
            )
          }
          text={live ? '直播间开播中' : '未开播'}
        />

        {/* Dynamic Danmaku Room Connection Pill */}
        <DynamicStatusPill
          triggerKey={`${connection.state}-${connection.roomId}`}
          statusClass={isRoomConnected ? 'pill-connected' : 'pill-disconnected'}
          icon={
            connection.state === 'connecting' || connection.state === 'reconnecting' ? (
              <RefreshCw size={13} className="spin status-icon-dim" />
            ) : isRoomConnected ? (
              <Wifi size={14} className="status-icon-green" />
            ) : (
              <WifiOff size={14} className="status-icon-dim" />
            )
          }
          text={connectionText}
        />
      </div>

      <div className="header-right">
        {/* Theme Toggle Button - Pure Liquid Glass Circle */}
        <button
          className="theme-toggle-btn"
          onClick={onToggleTheme}
          aria-label="切换主题"
        >
          {theme === 'pink-light' ? (
            <Sun size={16} className="theme-icon sun-icon" />
          ) : (
            <Moon size={16} className="theme-icon moon-icon" />
          )}
        </button>

        {account ? (
          <div className="account-cluster">
            <button
              className="account-pill"
              onClick={onJumpToAccount}
              aria-label="查看账号详情"
            >
              <div className="account-avatar">
                {account.avatar ? (
                  <img src={account.avatar} alt={account.uname} referrerPolicy="no-referrer" />
                ) : (
                  <span>{account.uname.slice(0, 1)}</span>
                )}
              </div>
              <div className="account-info">
                <span className="account-uname">{account.uname}</span>
                <span className="account-uid">UID: {account.uid}</span>
              </div>
            </button>

            <button
              className="action-pill-btn"
              disabled={disabled}
              onClick={onRefreshAccount}
              aria-label="刷新账号与直播状态"
            >
              <RefreshCw size={14} />
              <span className="action-pill-label">刷新</span>
            </button>

            <button
              className="action-pill-btn action-pill-danger"
              disabled={disabled}
              onClick={onLogoutConfirm}
              aria-label="退出登录"
            >
              <LogOut size={14} />
              <span className="action-pill-label">退出</span>
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" disabled={disabled} onClick={onOpenLogin}>
            <LogIn size={15} />
            <span>{loading ? '加载中…' : '扫码登录'}</span>
          </button>
        )}
      </div>
    </header>
  );
}

function DynamicStatusPill({
  icon,
  text,
  statusClass,
  triggerKey,
}: {
  icon: React.ReactNode;
  text: string;
  statusClass: string;
  triggerKey: string | number | boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isFirstMount = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    setExpanded(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setExpanded(false);
    }, 3800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [triggerKey]);

  return (
    <div
      className={`dynamic-pill ${statusClass} ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded(prev => !prev)}
      role="status"
    >
      <span className="dynamic-pill-icon">{icon}</span>
      <span className="dynamic-pill-text">{text}</span>
    </div>
  );
}

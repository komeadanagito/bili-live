import { MessageSquare, Radio, BarChart2, User } from 'lucide-react';
import BiliTvIcon from './BiliTvIcon';

export type TabKey = 'interaction' | 'broadcast' | 'stats' | 'account';

interface Props {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  live: boolean;
  messageCount: number;
  connected: boolean;
}

export default function Navigation({ activeTab, onSelectTab, live, messageCount, connected }: Props) {
  const tabs = [
    {
      key: 'interaction' as const,
      label: '实时互动',
      icon: MessageSquare,
      badge: messageCount > 0 ? (messageCount > 99 ? '99+' : String(messageCount)) : null,
      statusDot: connected ? 'connected' : null,
    },
    {
      key: 'broadcast' as const,
      label: '推流控制',
      icon: Radio,
      badge: live ? 'LIVE' : null,
      statusDot: live ? 'live' : null,
    },
    {
      key: 'stats' as const,
      label: '场次统计',
      icon: BarChart2,
    },
    {
      key: 'account' as const,
      label: '账号设置',
      icon: User,
    },
  ];

  return (
    <aside className="app-nav">
      {/* 纯净粉色小电视 LOGO (支持点击回到首页) */}
      <div className="nav-brand-pure">
        <button
          type="button"
          className="brand-logo-btn"
          onClick={() => onSelectTab('interaction')}
          aria-label="返回实时互动"
        >
          <BiliTvIcon size={40} color="#ff6699" className="bili-tv-svg" />
        </button>
      </div>

      <nav className="nav-menu">
        {tabs.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`nav-button ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.key)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="nav-icon-wrap">
                <Icon size={17} />
                {item.statusDot && <span className={`dot-mini ${item.statusDot}`} />}
              </span>
              <span className="nav-label">{item.label}</span>
              {item.badge && (
                <span className={`nav-chip ${item.key === 'broadcast' && live ? 'live-chip' : ''}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 侧边栏底部独立空白拖拽区 (专供随手拖拽，与上方按钮物理隔离互不干扰) */}
      <div
        className="nav-drag-spacer"
        data-tauri-drag-region
      />
    </aside>
  );
}

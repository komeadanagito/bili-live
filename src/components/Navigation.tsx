import { MessageSquare, Radio, BarChart2, User } from 'lucide-react';
import BiliTvIcon from './BiliTvIcon';
import { handleDragMouseDown } from '../bridge';

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
    <aside className="app-nav" data-tauri-drag-region onMouseDown={handleDragMouseDown}>
      {/* 纯净粉色小电视 LOGO (无任何底色/边框/提示气泡，透明清爽) */}
      <div
        className="nav-brand-pure"
        data-tauri-drag-region
        onClick={() => onSelectTab('interaction')}
      >
        <BiliTvIcon size={40} color="#ff6699" className="bili-tv-svg" />
      </div>

      <nav className="nav-menu" data-no-drag>
        {tabs.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
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

      {/* 侧边栏底部大面积空白拖拽区 (随手按住即可拖动窗口) */}
      <div
        className="nav-drag-spacer"
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
      />
    </aside>
  );
}

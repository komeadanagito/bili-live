import { MessageSquare, Radio, BarChart2, User, Tv } from 'lucide-react';

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
      <div className="nav-brand-clean">
        <Tv size={26} className="bili-tv-logo" />
      </div>

      <nav className="nav-menu">
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
    </aside>
  );
}

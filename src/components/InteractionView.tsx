import { useState, useRef, useEffect } from 'react';
import {
  Search,
  Trash2,
  Wifi,
  WifiOff,
  Gift,
  ShieldCheck,
  ArrowDown,
  Lock,
  Unlock,
  Sparkles,
} from 'lucide-react';
import type { Account, ConnectionStatus, LiveMessage, MessageKind } from '../types';
import { handleDragMouseDown } from '../bridge';

const KIND_LABELS: Record<MessageKind, string> = {
  danmaku: '弹幕',
  gift: '礼物',
  guard: '舰长',
  superchat: '醒目留言',
  'superchat-delete': '留言删除',
  interact: '互动',
  notice: '通知',
};

const STATE_LABELS: Record<ConnectionStatus['state'], string> = {
  connecting: '正在建立连接…',
  connected: '弹幕长链接正常',
  reconnecting: '正在尝试重连…',
  disconnected: '未建立连接',
  error: '长链接异常',
};

interface Props {
  account: Account | null;
  roomId: string;
  setRoomId: (id: string) => void;
  connection: ConnectionStatus;
  disabled: boolean;
  busy: string;
  messages: LiveMessage[];
  filter: MessageKind | 'all';
  setFilter: (filter: MessageKind | 'all') => void;
  query: string;
  setQuery: (q: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onClearMessages: () => void;
}

export default function InteractionView({
  account,
  roomId,
  setRoomId,
  connection,
  disabled,
  busy,
  messages,
  filter,
  setFilter,
  query,
  setQuery,
  onConnect,
  onDisconnect,
  onClearMessages,
}: Props) {
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const isConnected = connection.state === 'connected' || connection.state === 'connecting' || connection.state === 'reconnecting';

  // Filter messages
  const filteredMessages = messages.filter(msg => {
    if (filter !== 'all' && msg.kind !== filter) return false;
    if (query) {
      const q = query.toLowerCase();
      const matchUser = (msg.user || '').toLowerCase().includes(q);
      const matchText = (msg.text || '').toLowerCase().includes(q);
      const matchMedal = (msg.medal || '').toLowerCase().includes(q);
      return matchUser || matchText || matchMedal;
    }
    return true;
  });

  // Auto scroll effect
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [filteredMessages.length, autoScroll]);

  // Handle manual scroll to disable auto-scroll if user scrolled up
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    }
  };

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  return (
    <div className="view-container interaction-view">
      {/* Top Deck: Connection Control (空白处支持拖动窗口) */}
      <section
        className="interaction-deck-top card"
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
      >
        <div className="deck-col-inputs" data-no-drag>
          <div className="input-group">
            <span className="input-prefix">直播间</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="输入 B站直播间号"
              value={roomId}
              disabled={disabled}
              onChange={e => setRoomId(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !disabled && roomId.trim()) onConnect();
              }}
              className="text-input"
            />
            {account?.roomId && account.roomId !== '0' && account.roomId !== roomId && (
              <button
                type="button"
                className="btn-text-quick"
                onClick={() => setRoomId(account.roomId)}
                aria-label={`填入我的直播间 ${account.roomId}`}
              >
                我的房间 ({account.roomId})
              </button>
            )}
          </div>

          <div className="deck-actions">
            <button
              className={`btn ${isConnected ? 'btn-secondary' : 'btn-primary'}`}
              disabled={disabled || !roomId.trim()}
              onClick={isConnected ? onDisconnect : onConnect}
            >
              {isConnected ? <WifiOff size={15} /> : <Wifi size={15} />}
              <span>
                {busy === 'connect'
                  ? '连接中…'
                  : busy === 'disconnect'
                  ? '断开中…'
                  : isConnected
                  ? '断开连接'
                  : '建立连接'}
              </span>
            </button>
          </div>
        </div>

        <div className="connection-state-strip">
          <span className={`signal-dot ${connection.state === 'connected' ? 'connected' : connection.state === 'error' ? 'danger' : ''}`} />
          <span className="state-label">{STATE_LABELS[connection.state]}</span>
          {connection.roomId && (
            <span className="state-room font-mono">[ROOM: {connection.roomId}]</span>
          )}
          {connection.message && (
            <span className="state-msg font-mono">• {connection.message}</span>
          )}
        </div>
      </section>

      {/* Main Stream Area */}
      <section className="interaction-feed-card card">
        {/* Toolbar */}
        <div className="feed-toolbar">
          <div className="filter-chips-row">
            {(['all', 'danmaku', 'gift', 'superchat', 'guard', 'interact'] as const).map(kind => (
              <button
                key={kind}
                className={`chip ${filter === kind ? 'chip-active' : ''}`}
                onClick={() => setFilter(kind)}
              >
                {kind === 'all' ? '全部' : KIND_LABELS[kind]}
              </button>
            ))}
          </div>

          <div className="toolbar-right-tools">
            <div className="search-box">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="过滤用户 / 弹幕内容…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="search-input"
              />
              {query && (
                <button className="search-clear" onClick={() => setQuery('')}>
                  ×
                </button>
              )}
            </div>

            <button
              className={`action-pill-btn ${autoScroll ? 'active-icon' : ''}`}
              onClick={() => setAutoScroll(prev => !prev)}
              aria-label={autoScroll ? '锁定自动滚动' : '开启自动滚动'}
            >
              {autoScroll ? <Unlock size={14} /> : <Lock size={14} />}
              <span className="action-pill-label">{autoScroll ? '锁定' : '滚动'}</span>
            </button>

            <button
              className="action-pill-btn action-pill-danger"
              disabled={messages.length === 0}
              onClick={onClearMessages}
              aria-label="清空当前消息"
            >
              <Trash2 size={14} />
              <span className="action-pill-label">清空</span>
            </button>
          </div>
        </div>

        {/* Message Feed List */}
        <div className="feed-content-area">
          <div
            className="feed-scroller"
            ref={scrollContainerRef}
            onScroll={handleScroll}
            role="log"
            aria-live="off"
          >
            {filteredMessages.length > 0 && (
              <div className="feed-list">
                {filteredMessages.map(item => (
                  <MessageItem key={item.id} message={item} />
                ))}
              </div>
            )}
          </div>

          {!autoScroll && (
            <button className="floating-jump-bottom-btn" onClick={scrollToBottom}>
              <ArrowDown size={13} />
              <span>回到底部</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function MessageItem({ message }: { message: LiveMessage }) {
  const isSc = message.kind === 'superchat';
  const isGift = message.kind === 'gift';
  const isGuard = message.kind === 'guard';

  return (
    <article className={`feed-item kind-${message.kind}`}>
      <div className="item-meta-bar">
        {/* User avatar initial */}
        <span className="user-avatar-tag">
          {isGift ? (
            <Gift size={12} />
          ) : isGuard ? (
            <ShieldCheck size={12} />
          ) : isSc ? (
            <Sparkles size={12} />
          ) : (
            (message.user || '系').slice(0, 1)
          )}
        </span>

        {/* Sender Name */}
        <span className="sender-name font-mono">{message.user || '系统消息'}</span>

        {/* Medal Badge */}
        {message.medal && <span className="medal-tag">{message.medal}</span>}

        {/* Kind Badge */}
        <span className={`kind-tag kind-tag-${message.kind}`}>
          {KIND_LABELS[message.kind]}
        </span>

        {/* Timestamp */}
        <time className="message-time font-mono">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
        </time>
      </div>

      <div className="item-body">
        <p className="item-text">{message.text}</p>
        {(message.amount !== undefined || message.quantity !== undefined) && (
          <div className="item-extra-info font-mono">
            {message.quantity !== undefined && <span>数量: {message.quantity}</span>}
            {message.amount !== undefined && <span>价值: ¥{message.amount}</span>}
          </div>
        )}
      </div>
    </article>
  );
}

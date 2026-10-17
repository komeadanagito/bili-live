import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { listen, handleDragMouseDown, setOverlayPinned } from './bridge';
import type { LiveMessage, Theme } from './types';
import { renderMessageWithEmoticons } from './emoticons';
import {
  Pin,
  Gift,
  ShieldCheck,
  Sparkles,
  ArrowDown,
  MessageSquare,
} from 'lucide-react';

const KIND_LABELS: Record<string, string> = {
  danmaku: '弹幕',
  gift: '礼物',
  guard: '舰长',
  superchat: '醒目留言',
  'superchat-delete': '留言删除',
  interact: '互动',
  notice: '通知',
};

export default function OverlayApp() {
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('bili_live_theme');
      return saved === 'dark' ? 'dark' : 'pink-light';
    } catch {
      return 'pink-light';
    }
  });

  // “订在屏幕上”核心状态
  const [isPinned, setIsPinned] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 同步设置系统主题并确保底板透明
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'pink-light');
    document.documentElement.classList.add('is-overlay-window');
    document.body.classList.add('is-overlay-window');
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    try {
      localStorage.setItem('bili_live_theme', theme);
    } catch {}
  }, [theme]);

  // 监听来自主窗口的主题同步事件
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<string>('theme-changed', (event) => {
      if (event.payload === 'dark' || event.payload === 'pink-light') {
        setTheme(event.payload as Theme);
      }
    }).then(u => { unlisten = u; });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // 监听实时弹幕事件 (内存严格控制在最新 80 条，避免内存膨胀)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<LiveMessage>('live-message', (event) => {
      setMessages(prev => {
        const next = [...prev, event.payload];
        if (next.length > 80) {
          return next.slice(next.length - 80);
        }
        return next;
      });
    }).then(u => { unlisten = u; });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // 切换“固定穿透”与“解锁移动”模式
  const togglePin = useCallback(async () => {
    const next = !isPinned;
    setIsPinned(next);
    try {
      await setOverlayPinned(next);
    } catch {
      // 容错
    }
  }, [isPinned]);

  // 组件卸载时恢复正常状态
  useEffect(() => {
    return () => {
      void setOverlayPinned(false);
    };
  }, []);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, autoScroll]);

  return (
    <div
      className={`overlay-window-root ${isPinned ? 'mode-pinned' : 'mode-interactive'}`}
      data-tauri-drag-region={!isPinned ? true : undefined}
    >
      {/* 顶部微型悬浮操作条 */}
      <header
        className={`overlay-toolbar ${isPinned ? 'pinned-toolbar' : ''}`}
        data-tauri-drag-region={!isPinned ? true : undefined}
        onMouseDown={!isPinned ? handleDragMouseDown : undefined}
      >
        <div className="toolbar-left" data-tauri-drag-region={!isPinned ? true : undefined}>
          <span
            className="overlay-drag-handle"
            title={isPinned ? '已固定穿透 (可直接操作悬浮窗背后的内容)' : '按住拖动窗口 (点击右上角图钉固定)'}
          >
            <MessageSquare size={13} className="overlay-logo-icon" />
            <span className="overlay-title-text">弹幕</span>
          </span>
          <span className="overlay-badge-count">{messages.length}</span>
        </div>

        <div className="toolbar-actions" data-no-drag>
          {/* 顶栏图钉按钮：固定后全区域鼠标穿透操作背景，鼠标移至此图钉即刻可点击解开 */}
          <button
            type="button"
            className={`overlay-tool-btn overlay-pin-btn ${isPinned ? 'active-pinned' : ''}`}
            onClick={togglePin}
            title={isPinned ? '已固定穿透 (鼠标可直接点击操作背景内容，点击图钉解开以移动)' : '固定悬浮窗 (固定后可直接操作悬浮窗背后的内容)'}
            aria-label={isPinned ? '已固定穿透' : '固定悬浮窗'}
            data-no-drag
          >
            <Pin size={13} className={isPinned ? 'pin-icon-locked' : 'pin-icon-free'} />
          </button>
        </div>
      </header>

      {/* 弹幕聊天对话气泡流 (订住时 pointer-events: none 禁止任何误触误选) */}
      <main
        className="overlay-message-stream"
        ref={scrollRef}
        onWheel={() => {
          if (!isPinned && scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            const nearBottom = scrollHeight - scrollTop - clientHeight < 40;
            setAutoScroll(nearBottom);
          }
        }}
      >
        {messages.length === 0 ? (
          <div className="overlay-empty-state">
            <span className="empty-bubble-placeholder">等待弹幕接入…</span>
          </div>
        ) : (
          <div className="overlay-bubble-list">
            {messages.map(item => (
              <OverlayBubbleItem key={item.id} message={item} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* 滚到底部快捷浮动按钮 (仅未订住时支持点按) */}
      {!isPinned && !autoScroll && (
        <button
          type="button"
          className="overlay-scroll-bottom-btn"
          onClick={() => {
            setAutoScroll(true);
            scrollToBottom();
          }}
          data-no-drag
        >
          <ArrowDown size={11} />
          <span>最新</span>
        </button>
      )}
    </div>
  );
}

/**
 * 悬浮窗单个对话气泡
 * - 高性能低透明轻量气泡，零 GPU 重排消耗
 * - 清晰呈现头像、勋章、昵称、B站表情包与气泡文本
 */
const OverlayBubbleItem = memo(function OverlayBubbleItem({ message }: { message: LiveMessage }) {
  const isSc = message.kind === 'superchat';
  const isGift = message.kind === 'gift';
  const isGuard = message.kind === 'guard';

  return (
    <div className={`overlay-bubble-item kind-${message.kind}`}>
      <div className="bubble-header-row">
        {/* 用户头像 */}
        <span className="bubble-avatar-slot">
          {message.avatar ? (
            <img
              src={message.avatar}
              alt={message.user}
              className="bubble-avatar-img"
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={e => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          ) : isGift ? (
            <Gift size={11} />
          ) : isGuard ? (
            <ShieldCheck size={11} />
          ) : isSc ? (
            <Sparkles size={11} />
          ) : (
            (message.user || '系').slice(0, 1)
          )}
        </span>

        {/* 昵称 */}
        <span className="bubble-username">{message.user || '系统消息'}</span>

        {/* 粉丝勋章 */}
        {message.medal && <span className="bubble-medal-tag">{message.medal}</span>}

        {/* 类型标 (普通弹幕省略标牌，让界面更清爽) */}
        {message.kind !== 'danmaku' && (
          <span className={`bubble-kind-badge badge-${message.kind}`}>
            {KIND_LABELS[message.kind] || message.kind}
          </span>
        )}

        {/* 时间 */}
        <time className="bubble-time">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour12: false, minute: '2-digit', second: '2-digit' })}
        </time>
      </div>

      <div className="bubble-body-content">
        <div className="bubble-text-msg">
          {renderMessageWithEmoticons(message.text, message.emots)}
        </div>
        {(message.amount !== undefined || message.quantity !== undefined) && (
          <div className="bubble-extra-meta">
            {message.quantity !== undefined && <span>×{message.quantity}</span>}
            {message.amount !== undefined && <span>¥{message.amount}</span>}
          </div>
        )}
      </div>
    </div>
  );
});

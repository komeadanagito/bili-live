import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { copyText, invoke, listen, handleDragMouseDown, handleDragDoubleClick } from './bridge';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import Navigation, { type TabKey } from './components/Navigation';
import Header from './components/Header';
import InteractionView from './components/InteractionView';
import BroadcastView from './components/BroadcastView';
import StatsView from './components/StatsView';
import AccountView from './components/AccountView';
import LoginModal from './LoginModal';
import ConfirmModal from './components/ConfirmModal';
import type { Account, Area, ConnectionStatus, LiveMessage, LiveStats, MessageKind, StreamInfo, Theme } from './types';
import { appendMessage, errorText, flattenAreas } from './utils';

const initialConnection: ConnectionStatus = { state: 'disconnected', roomId: '', message: '' };

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('interaction');
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('bili_live_theme');
      return saved === 'dark' ? 'dark' : 'pink-light';
    } catch {
      return 'pink-light';
    }
  });
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);
  const [confirm, setConfirm] = useState<'stop' | 'logout' | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState('');
  const [recentArea, setRecentArea] = useState('');
  const [roomId, setRoomId] = useState('');
  const [connection, setConnection] = useState(initialConnection);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [filter, setFilter] = useState<MessageKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [stream, setStream] = useState<StreamInfo | null>(null);
  const [live, setLive] = useState(false);
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState('');

  const mounted = useRef(false);
  const operation = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const eventRoom = useRef('');

  const options = useMemo(() => flattenAreas(areas), [areas]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      if (mounted.current) setNotice('');
    }, 2800);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      if (mounted.current) setError('');
    }, 4500);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('bili_live_theme', theme);
    } catch {
      // Ignore localStorage errors in restricted environments
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(current => {
      const next = current === 'dark' ? 'pink-light' : 'dark';
      setNotice(next === 'pink-light' ? '已切换至白粉液态玻璃主题' : '已切换至黑浅蓝透明玻璃主题');
      return next;
    });
  }, []);

  const handleSetTheme = useCallback((newTheme: Theme) => {
    setTheme(current => {
      if (current === newTheme) return current;
      setNotice(newTheme === 'pink-light' ? '已切换至白粉液态玻璃主题' : '已切换至黑浅蓝透明玻璃主题');
      return newTheme;
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    const cleanup: (() => void)[] = [];

    void Promise.all([
      invoke<Account | null>('get_account').then(async value => {
        if (disposed) return;
        setAccount(value);
        setRoomId(value?.roomId ?? '');
        setLive(value?.liveStatus === 1);
        if (value) {
          try {
            const recent = await invoke<{ id: number; name: string }>('get_recent_area');
            if (!disposed) {
              setAreaId(recent.id > 0 ? String(recent.id) : '');
              setRecentArea(recent.name);
            }
          } catch {
            // First time without previous area is normal
          }
        }
      }),
      invoke<Area[]>('get_areas').then(value => {
        if (!disposed) setAreas(value);
      }),
    ].map(promise =>
      promise.catch(e => {
        if (!disposed) setError(errorText(e));
      })
    )).finally(() => {
      if (!disposed) setLoading(false);
    });

    const subscribe = async () => {
      const stopMessages = await listen<LiveMessage>('live-message', event => {
        if (!disposed && (!eventRoom.current || event.payload.roomId === eventRoom.current)) {
          setMessages(current => appendMessage(current, event.payload));
        }
      });
      if (disposed) {
        stopMessages();
        return;
      }
      cleanup.push(stopMessages);

      const stopStatus = await listen<ConnectionStatus>('connection-status', event => {
        if (!disposed) {
          eventRoom.current = event.payload.roomId;
          setConnection(event.payload);
        }
      });
      if (disposed) stopStatus();
      else cleanup.push(stopStatus);
    };

    void subscribe().catch(e => {
      if (!disposed) setError(`事件监听失败：${errorText(e)}`);
    });

    return () => {
      disposed = true;
      mounted.current = false;
      cleanup.forEach(stop => stop());
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const run = useCallback(async (name: string, action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(name);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      if (mounted.current) setError(errorText(e));
    } finally {
      operation.current = false;
      if (mounted.current) setBusy('');
    }
  }, []);

  const disabled = loading || !!busy;

  const loginSuccess = useCallback((value: Account) => {
    setAccount(value);
    setRoomId(value.roomId);
    setLive(value.liveStatus === 1);
    setLoginOpen(false);
    setStream(null);
    setStats(null);
    setAreaId('');
    setRecentArea('');
    setNotice('认证成功，已同步直播间信息。');

    void invoke<{ id: number; name: string }>('get_recent_area')
      .then(recent => {
        if (mounted.current) {
          setAreaId(recent.id > 0 ? String(recent.id) : '');
          setRecentArea(recent.name);
        }
      })
      .catch(() => {});
  }, []);

  const startLive = () => {
    void run('start', async () => {
      try {
        const result = await invoke<StreamInfo>('start_live', { areaId: Number(areaId) });
        if (!mounted.current) return;
        setStream(result);
        setLive(true);
        setRevealed(false);
        setStats(null);
        setNotice('直播间已成功开启。推流凭据已就绪，请配置至 OBS / vMix 推流软件。');
      } catch (e) {
        try {
          const current = await invoke<Account | null>('get_account');
          if (mounted.current && current) {
            setAccount(current);
            setLive(current.liveStatus === 1);
          }
        } catch {}
        throw e;
      }
    });
  };

  const stopLive = () => {
    setConfirm(null);
    void run('stop', async () => {
      try {
        const result = await invoke<LiveStats>('stop_live');
        if (!mounted.current) return;
        setLive(false);
        setStream(null);
        setRevealed(false);
        setStats(result.available ? result : null);
        setNotice(result.warning || '直播已结束，本场复盘数据已更新至「场次统计」模块。');
      } catch (e) {
        try {
          const current = await invoke<Account | null>('get_account');
          if (mounted.current && current) {
            setAccount(current);
            if (current.liveStatus !== 1) {
              setLive(false);
              setStream(null);
              setRevealed(false);
              setStats(null);
              setNotice('直播间当前已停止，场次数据暂不可用。');
            }
          }
        } catch {}
        throw e;
      }
    });
  };

  const logout = () => {
    setConfirm(null);
    void run('logout', async () => {
      await invoke('logout');
      if (!mounted.current) return;
      setAccount(null);
      setLive(false);
      setStream(null);
      setRevealed(false);
      setStats(null);
      setNotice('已退出当前账号登录。');
    });
  };

  const connectRoom = () => {
    const value = roomId.trim();
    if (!/^\d+$/.test(value) || !/[1-9]/.test(value)) {
      setError('请输入合法的数字直播间号。');
      return;
    }
    void run('connect', async () => {
      const previous = eventRoom.current;
      eventRoom.current = value;
      setMessages([]);
      setConnection({ state: 'connecting', roomId: value, message: '正在建立连接…' });
      try {
        await invoke('connect_room', { roomId: value });
      } catch (e) {
        eventRoom.current = previous;
        if (mounted.current) {
          setConnection({ state: 'error', roomId: value, message: errorText(e) });
        }
        throw e;
      }
    });
  };

  const disconnectRoom = () => {
    void run('disconnect', async () => {
      await invoke('disconnect_room');
      if (mounted.current) {
        setConnection(initialConnection);
        eventRoom.current = '';
      }
    });
  };

  const copy = (value: string, name: string) => {
    void run('copy', async () => {
      await copyText(value);
      if (!mounted.current) return;
      setCopied(name);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => {
        if (mounted.current) setCopied('');
      }, 2000);
    });
  };

  const refreshAccount = () => {
    void run('refresh', async () => {
      const current = await invoke<Account | null>('get_account');
      if (mounted.current) {
        setAccount(current);
        setLive(current?.liveStatus === 1);
        if (current?.liveStatus !== 1) {
          setStream(null);
          setRevealed(false);
        }
        setNotice('账号与直播状态已同步刷新。');
      }
    });
  };

  return (
    <div className="app-shell">
      {/* Invisible Global Top Edge Drag Bar */}
      <div
        className="app-window-drag-strip"
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
        onDoubleClick={handleDragDoubleClick}
      />

      {/* Minimal Left Sidebar Navigation */}
      <Navigation
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        live={live}
        messageCount={messages.length}
        connected={connection.state === 'connected'}
      />

      {/* Main Content Area */}
      <div className="app-main-viewport">
        {/* Global Topbar */}
        <Header
          account={account}
          loading={loading}
          disabled={disabled}
          live={live}
          connection={connection}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenLogin={() => setLoginOpen(true)}
          onRefreshAccount={refreshAccount}
          onLogoutConfirm={() => setConfirm('logout')}
          onJumpToAccount={() => setActiveTab('account')}
        />

        {/* Floating Apple Liquid Toast Notification */}
        {(notice || error) && (
          <div className="floating-toast-container">
            {notice && (
              <div
                className="liquid-toast toast-success"
                onClick={() => setNotice('')}
                role="status"
              >
                <CheckCircle size={15} className="toast-icon" />
                <span>{notice}</span>
              </div>
            )}
            {error && (
              <div
                className="liquid-toast toast-error"
                onClick={() => setError('')}
                role="alert"
              >
                <AlertTriangle size={15} className="toast-icon" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* Modular View Switcher */}
        <main className="tab-stage">
          <div className="tab-view-transition" key={activeTab}>
            {activeTab === 'interaction' && (
              <InteractionView
                account={account}
                roomId={roomId}
                setRoomId={setRoomId}
                connection={connection}
                disabled={disabled}
                busy={busy}
                messages={messages}
                filter={filter}
                setFilter={setFilter}
                query={query}
                setQuery={setQuery}
                onConnect={connectRoom}
                onDisconnect={disconnectRoom}
                onClearMessages={() => setMessages([])}
              />
            )}

            {activeTab === 'broadcast' && (
              <BroadcastView
                account={account}
                live={live}
                disabled={disabled}
                busy={busy}
                areaId={areaId}
                setAreaId={setAreaId}
                recentArea={recentArea}
                stream={stream}
                revealed={revealed}
                setRevealed={setRevealed}
                copied={copied}
                onCopy={copy}
                onStartLive={startLive}
                onStopLiveConfirm={() => setConfirm('stop')}
                onOpenLogin={() => setLoginOpen(true)}
                options={options}
              />
            )}

            {activeTab === 'stats' && <StatsView stats={stats} live={live} />}

            {activeTab === 'account' && (
              <AccountView
                account={account}
                live={live}
                disabled={disabled}
                busy={busy}
                connection={connection}
                copied={copied}
                theme={theme}
                onSetTheme={handleSetTheme}
                onCopy={copy}
                onOpenLogin={() => setLoginOpen(true)}
                onRefreshAccount={refreshAccount}
                onLogoutConfirm={() => setConfirm('logout')}
              />
            )}
          </div>
        </main>
      </div>

      {/* Login Modal */}
      {loginOpen && (
        <LoginModal onClose={() => setLoginOpen(false)} onSuccess={loginSuccess} />
      )}

      {/* Confirmation Modal */}
      {confirm && (
        <ConfirmModal
          type={confirm}
          live={live}
          disabled={disabled}
          onConfirm={confirm === 'stop' ? stopLive : logout}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

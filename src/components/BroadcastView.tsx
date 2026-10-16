import { useState, useRef, useEffect } from 'react';
import {
  Play,
  Square,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldAlert,
  Tv,
  ChevronDown,
  Search,
} from 'lucide-react';
import type { Account, StreamInfo } from '../types';

interface Props {
  account: Account | null;
  live: boolean;
  disabled: boolean;
  busy: string;
  areaId: string;
  setAreaId: (id: string) => void;
  recentArea: string;
  stream: StreamInfo | null;
  revealed: boolean;
  setRevealed: (fn: (v: boolean) => boolean) => void;
  copied: string;
  onCopy: (text: string, name: string) => void;
  onStartLive: () => void;
  onStopLiveConfirm: () => void;
  onOpenLogin: () => void;
  options: { id: number; name: string }[];
}

export default function BroadcastView({
  account,
  live,
  disabled,
  busy,
  areaId,
  setAreaId,
  recentArea,
  stream,
  revealed,
  setRevealed,
  copied,
  onCopy,
  onStartLive,
  onStopLiveConfirm,
  onOpenLogin,
  options,
}: Props) {
  const [copyAllState, setCopyAllState] = useState(false);

  const handleCopyAll = () => {
    if (!stream) return;
    const combined = `推流地址:\n${stream.addr}\n\n串流密钥:\n${stream.code}`;
    onCopy(combined, 'all');
    setCopyAllState(true);
    setTimeout(() => setCopyAllState(false), 2000);
  };

  return (
    <div className="view-container broadcast-view">
      <div className="broadcast-grid">
        {/* Left Column: Live Control Deck */}
        <section className="card broadcast-control-card">
          <div className="card-header">
            <div className="card-title-group">
              <h3>播控中心</h3>
            </div>
            <div className={`status-pill ${live ? 'live-pill' : 'idle-pill'}`}>
              <span className={`signal-dot ${live ? 'pulse' : ''}`} />
              <span>{live ? '正在开播' : '未开播'}</span>
            </div>
          </div>

          <div className="control-body">
            {!account ? (
              <div className="broadcast-auth-notice">
                <ShieldAlert size={28} />
                <h4>尚未登录哔哩哔哩账号</h4>
                <p>开启直播与获取推流凭据需主播本人账号权限。</p>
                <button className="btn btn-primary" onClick={onOpenLogin}>
                  立即扫码登录
                </button>
              </div>
            ) : (
              <>
                {/* Account Room Quick Info */}
                <div className="room-info-strip font-mono">
                  <div className="info-cell">
                    <span className="cell-label">主播名称</span>
                    <span className="cell-val">{account.uname}</span>
                  </div>
                  <div className="info-cell">
                    <span className="cell-label">直播间号</span>
                    <span className="cell-val">
                      {account.roomId && account.roomId !== '0' ? account.roomId : '未开通'}
                    </span>
                  </div>
                </div>

                {/* Partition Selector - Custom Apple Liquid Glass Select */}
                <div className="form-group">
                  <div className="form-label-row">
                    <label className="form-label">直播分区选择</label>
                    {recentArea && (
                      <button
                        type="button"
                        className="recent-area-chip"
                        onClick={() => {
                          const found = options.find(o => o.name.includes(recentArea));
                          if (found) setAreaId(String(found.id));
                        }}
                      >
                        上次使用: {recentArea}
                      </button>
                    )}
                  </div>

                  <GlassSelect
                    value={areaId}
                    onChange={setAreaId}
                    disabled={disabled || live}
                    options={options}
                    recentArea={recentArea}
                    placeholder="请选择直播分类…"
                  />
                </div>

                {/* Main Action Button */}
                <div className="action-row">
                  <button
                    className={`btn-giant ${live ? 'btn-giant-danger' : 'btn-giant-primary'}`}
                    disabled={disabled || (!live && !areaId)}
                    onClick={live ? onStopLiveConfirm : onStartLive}
                  >
                    {busy === 'start' || busy === 'stop' ? (
                      <RefreshCw className="spin" size={20} />
                    ) : live ? (
                      <Square size={20} />
                    ) : (
                      <Play size={20} />
                    )}
                    <span>
                      {busy === 'start'
                        ? '正在向服务器请求开播…'
                        : busy === 'stop'
                        ? '正在请求下播…'
                        : live
                        ? '结束当前直播'
                        : '启动直播间'}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Right Column: OBS Stream Configuration Deck */}
        <section className="card stream-deck-card">
          <div className="card-header">
            <div className="card-title-group">
              <h3>OBS 推流凭据</h3>
            </div>
            {stream && (
              <button
                className="btn-icon"
                onClick={() => setRevealed(v => !v)}
                aria-label={revealed ? '隐藏串流密钥' : '显示串流密钥'}
              >
                {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            )}
          </div>

          <div className="stream-deck-body">
            {stream ? (
              <div className="credentials-container">
                <div className="cred-field">
                  <div className="cred-label-row">
                    <span className="cred-label">推流服务器</span>
                    <button
                      className="btn-copy-chip font-mono"
                      onClick={() => onCopy(stream.addr, 'addr')}
                    >
                      {copied === 'addr' ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copied === 'addr' ? '已复制' : '复制地址'}</span>
                    </button>
                  </div>
                  <div className="cred-code-box font-mono">
                    <code>{stream.addr}</code>
                  </div>
                </div>

                <div className="cred-field">
                  <div className="cred-label-row">
                    <span className="cred-label">串流密钥</span>
                    <button
                      className="btn-copy-chip font-mono"
                      onClick={() => onCopy(stream.code, 'code')}
                    >
                      {copied === 'code' ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copied === 'code' ? '已复制' : '复制密钥'}</span>
                    </button>
                  </div>
                  <div className="cred-code-box font-mono secret-box">
                    <code>{revealed ? stream.code : '••••••••••••••••••••••••••••••••••••••••'}</code>
                  </div>
                </div>

                <div className="quick-copy-all-row">
                  <button className="btn btn-secondary btn-full font-mono" onClick={handleCopyAll}>
                    {copyAllState ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copyAllState ? '已复制完整推流参数至剪贴板' : '一键复制完整 OBS 配置'}</span>
                  </button>
                </div>

                <div className="obs-hint-box">
                  <div className="hint-title">OBS 推流配置步骤</div>
                  <ol className="obs-steps font-mono">
                    <li>打开 OBS Studio → 进入「设置」→「直播」</li>
                    <li>服务选择「自定义…」</li>
                    <li>将推流服务器填入「服务器」栏目</li>
                    <li>将串流密钥填入「串流密钥」栏目</li>
                    <li>点击 OBS 界面右下角「开始推流」即可输出画面</li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="empty-credentials">
                <div className="empty-symbol">
                  <Tv size={24} />
                </div>
                <div className="empty-text-col">
                  <div className="empty-title">
                    {live ? '本次尚未获取推流地址' : '开启直播间后自动生成推流配置'}
                  </div>
                  <div className="empty-hint font-mono">
                    点击上方「启动直播间」后，B站官方服务器将返回专属推流服务器与安全串流密钥。
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function GlassSelect({
  value,
  onChange,
  disabled,
  options,
  recentArea,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled: boolean;
  options: { id: number; name: string }[];
  recentArea?: string;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => String(o.id) === value);
  const displayLabel = selectedOption ? selectedOption.name : (value ? (recentArea || `当前分区 (${value})`) : '');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = search.trim()
    ? options.filter(o => o.name.toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  return (
    <div className="glass-select-container" ref={containerRef}>
      <button
        type="button"
        className={`glass-select-trigger ${open ? 'select-open' : ''}`}
        disabled={disabled}
        onClick={() => setOpen(prev => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={displayLabel ? 'select-val' : 'select-placeholder'}>
          {displayLabel || placeholder}
        </span>
        <ChevronDown size={16} className={`chevron-icon ${open ? 'rotated' : ''}`} />
      </button>

      {open && !disabled && (
        <div className="glass-select-dropdown" role="listbox">
          {options.length > 6 && (
            <div className="dropdown-search-box">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="搜索直播分区 (如 单机、电台)…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
                className="dropdown-search-input"
              />
              {search && (
                <button type="button" className="search-clear-btn" onClick={() => setSearch('')}>
                  ×
                </button>
              )}
            </div>
          )}

          <div className="dropdown-options-list">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(item => {
                const isSelected = String(item.id) === value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`dropdown-option-item ${isSelected ? 'option-selected' : ''}`}
                    onClick={() => {
                      onChange(String(item.id));
                      setOpen(false);
                      setSearch('');
                    }}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span>{item.name}</span>
                    {isSelected && <Check size={14} className="option-check" />}
                  </button>
                );
              })
            ) : (
              <div className="dropdown-empty-hint">未找到匹配的分区</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

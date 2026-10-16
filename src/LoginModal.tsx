import { useEffect, useRef, useState } from 'react';
import { invoke } from './bridge';
import { RefreshCw, X, Shield } from 'lucide-react';
import type { Account, QrLogin, QrResult } from './types';
import { errorText } from './utils';

interface Props {
  onClose: () => void;
  onSuccess: (account: Account) => void;
}

export default function LoginModal({ onClose, onSuccess }: Props) {
  const [qr, setQr] = useState<QrLogin | null>(null);
  const [status, setStatus] = useState<QrResult['status']>('waiting');
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  const successRef = useRef(onSuccess);
  successRef.current = onSuccess;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setQr(null);
    setError('');
    setStatus('waiting');

    async function poll(key: string) {
      try {
        const result = await invoke<QrResult>('poll_qr_login', { key });
        if (cancelled) return;
        setStatus(result.status);
        if (result.status === 'success') {
          if (result.account) {
            successRef.current(result.account);
          } else {
            setError('登录成功，但未返回账号信息，请关闭后重试。');
          }
          return;
        }
        if (result.status === 'expired') return;
        timer = setTimeout(() => {
          void poll(key);
        }, 2000);
      } catch (e) {
        if (!cancelled) setError(errorText(e));
      }
    }

    void invoke<QrLogin>('begin_qr_login')
      .then(result => {
        if (cancelled) return;
        setQr(result);
        timer = setTimeout(() => {
          void poll(result.key);
        }, 2000);
      })
      .catch(e => {
        if (!cancelled) setError(errorText(e));
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [generation]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const statusLabel = {
    waiting: '等待扫描二维码…',
    scanned: '已扫描，请在哔哩哔哩手机客户端上点击确认',
    expired: '二维码已过期，请点击下方刷新',
    success: '认证成功，正在载入账号…',
  }[status];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section
        className="modal login-modal-minimal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        onClick={e => e.stopPropagation()}
      >
        <button
          autoFocus
          className="btn-icon modal-close"
          onClick={onClose}
          aria-label="关闭登录窗口"
        >
          <X size={16} />
        </button>

        <div className="login-header">
          <h2 id="login-title">哔哩哔哩扫码登录</h2>
          <p className="login-sub">请使用哔哩哔哩手机 App 扫描二维码以授权登录</p>
        </div>

        <div className="qr-viewport-card">
          <div className={`qr-frame ${status === 'expired' ? 'frame-expired' : ''}`}>
            {qr ? (
              <img src={qr.image} alt="哔哩哔哩登录二维码" className="qr-image" />
            ) : (
              <div className="qr-loading">
                <RefreshCw className="spin" size={24} />
                <span className="font-mono">INITIALIZING QR...</span>
              </div>
            )}
            {status === 'expired' && (
              <div className="qr-overlay-expired">
                <span className="font-mono">EXPIRED</span>
              </div>
            )}
          </div>

          <div className="qr-status-indicator font-mono">
            <span
              className={`signal-dot ${
                status === 'success' ? 'connected' : status === 'expired' ? 'danger' : 'pulse'
              }`}
            />
            <span className="status-text">{statusLabel}</span>
          </div>
        </div>

        {error && (
          <div className="login-error-strip font-mono" role="alert">
            {error}
          </div>
        )}

        {(error || status === 'expired') && (
          <button
            className="btn btn-primary btn-full font-mono"
            onClick={() => setGeneration(v => v + 1)}
          >
            <RefreshCw size={14} />
            <span>刷新二维码 (RELOAD QR)</span>
          </button>
        )}

        <div className="login-footer font-mono">
          <Shield size={13} />
          <span>本地隔离：登录凭据存储于本机操作系统安全存储空间，不经由外部云端中转。</span>
        </div>
      </section>
    </div>
  );
}

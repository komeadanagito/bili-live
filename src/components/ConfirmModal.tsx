import { useEffect } from 'react';
import { LogOut, Square } from 'lucide-react';

interface Props {
  type: 'stop' | 'logout';
  live: boolean;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ type, live, disabled, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const isStop = type === 'stop';

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <section
        className="modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-icon-badge danger">
          {isStop ? <Square size={22} /> : <LogOut size={22} />}
        </div>
        <h2 id="confirm-title">{isStop ? '确认结束当前直播？' : '确认退出登录？'}</h2>
        <p className="modal-desc">
          {isStop
            ? '直播间将变更为未开播状态，并尝试抓取本次下播统计。请同时检查 OBS / vMix 等推流软件的推流状态。'
            : live
            ? '注意：你的直播间目前正处于开播状态。退出账号不会自动断流或下播；如需结束直播，请先取消并点击「结束直播」。'
            : '退出当前账号后，需重新使用手机客户端扫码认证方可管理直播间与推流配置。'}
        </p>

        <div className="modal-actions">
          <button autoFocus className="btn btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button className="btn btn-danger" disabled={disabled} onClick={onConfirm}>
            {isStop ? '确认下播' : '确认退出'}
          </button>
        </div>
      </section>
    </div>
  );
}

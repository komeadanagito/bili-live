import { Flame, Users, Eye } from 'lucide-react';

export type MetricType = 'flame' | 'online' | 'watched';

interface MetricCapsuleProps {
  type: MetricType;
  value: string | number;
  label: string;
  className?: string;
}

/**
 * 格式化数值展示 (大于1万显示 x.x万)
 */
export function formatMetricNumber(val: number | string): string {
  if (typeof val === 'number') {
    if (val >= 10000) {
      return `${(val / 10000).toFixed(1)}万`;
    }
    return String(val);
  }
  return val;
}

/**
 * 高质感圆圆指标胶囊 (Aesthetic Round Metric Capsule)
 * - 字体与前面按钮完全一致 (统一人文无衬线体, 饱满 600 字重)
 * - 常态: 圆圆小巧，只展示纯单色 14px 线性图标与数字
 * - 悬停: 丝滑滑动展开文字描述 (如 "人气", "在线", "看过")
 */
export default function MetricCapsule({
  type,
  value,
  label,
  className = '',
}: MetricCapsuleProps) {
  return (
    <div
      className={`round-metric-capsule capsule-${type} ${className}`}
      data-no-drag
    >
      <span className="capsule-icon">
        {type === 'flame' && <Flame size={14} strokeWidth={2} />}
        {type === 'online' && <Users size={14} strokeWidth={2} />}
        {type === 'watched' && <Eye size={14} strokeWidth={2} />}
      </span>
      <span className="capsule-sliding-label">{label}</span>
      <span className="capsule-value">{value}</span>
    </div>
  );
}

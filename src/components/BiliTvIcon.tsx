interface Props {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * 经典纯净粉色小电视吉祥物 SVG (无多余外框，纯透明背景)
 */
export default function BiliTvIcon({ size = 36, color = '#ff6699', className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* 顶部天线触角 */}
      <path
        d="M37 28L25 13"
        stroke={color}
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <path
        d="M63 28L75 13"
        stroke={color}
        strokeWidth="6.5"
        strokeLinecap="round"
      />

      {/* 电视机萌系圆润机身 */}
      <rect
        x="13"
        y="26"
        width="74"
        height="53"
        rx="20"
        ry="20"
        stroke={color}
        strokeWidth="6.5"
      />

      {/* 左眼与右眼 (大圆点) */}
      <circle cx="38" cy="48" r="5.2" fill={color} />
      <circle cx="62" cy="48" r="5.2" fill={color} />

      {/* 萌系小嘴巴微笑曲线 */}
      <path
        d="M45.5 59C47.2 63.5 52.8 63.5 54.5 59"
        stroke={color}
        strokeWidth="4.8"
        strokeLinecap="round"
      />

      {/* 底部两只小脚 */}
      <path
        d="M31 78L26 89"
        stroke={color}
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <path
        d="M69 78L74 89"
        stroke={color}
        strokeWidth="6.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

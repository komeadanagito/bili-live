import { BarChart3, Clock, Users, Eye, MessageSquare, Heart, Award, Coins, AlertCircle } from 'lucide-react';
import type { LiveStats } from '../types';
import { duration } from '../utils';

interface Props {
  stats: LiveStats | null;
  live: boolean;
}

export default function StatsView({ stats, live }: Props) {
  const metricCards = stats
    ? [
        {
          label: '直播时长',
          val: duration(stats.liveTime),
          icon: Clock,
        },
        {
          label: '累计观看人次',
          val: stats.watchedCount.toLocaleString(),
          icon: Eye,
        },
        {
          label: '最高在线峰值',
          val: stats.maxOnline.toLocaleString(),
          icon: Users,
        },
        {
          label: '弹幕互动总量',
          val: stats.danmuNum.toLocaleString(),
          icon: MessageSquare,
        },
        {
          label: '新增关注粉丝',
          val: stats.addFans.toLocaleString(),
          icon: Heart,
        },
        {
          label: '新增粉丝团团员',
          val: stats.newFansClub.toLocaleString(),
          icon: Award,
        },
        {
          label: '金仓鼠收益流水',
          val: `¥ ${stats.hamsterRmb.toLocaleString()}`,
          icon: Coins,
        },
      ]
    : [];

  return (
    <div className="view-container stats-view">
      <section className="card stats-main-card">
        <div className="card-header">
          <div className="card-title-group">
            <h3>场次复盘数据</h3>
          </div>
          <div className="status-pill idle-pill">
            <span className="signal-dot" />
            <span>
              {stats ? '数据已生成' : live ? '直播进行中' : '等待下播统计'}
            </span>
          </div>
        </div>

        <div className="stats-body">
          {stats ? (
            <div className="stats-content">
              {stats.warning && (
                <div className="stats-warning-banner">
                  <AlertCircle size={15} />
                  <span>{stats.warning}</span>
                </div>
              )}

              <div className="metrics-grid">
                {metricCards.map(card => {
                  const Icon = card.icon;
                  return (
                    <div className="metric-box" key={card.label}>
                      <div className="metric-top">
                        <span className="metric-label">{card.label}</span>
                        <Icon size={16} className="metric-icon" />
                      </div>
                      <div className="metric-val">{card.val}</div>
                    </div>
                  );
                })}
              </div>

              <div className="stats-foot-note">
                * 数据由哔哩哔哩开放接口在关播时结算返回，部分指标可能存在几分钟网络延迟。
              </div>
            </div>
          ) : (
            <div className="stats-empty-state">
              <div className="empty-symbol">
                <BarChart3 size={40} />
              </div>
              <div className="empty-title">
                {live ? '当前直播正在进行中' : '暂无最近场次复盘数据'}
              </div>
              <div className="empty-hint font-mono">
                {live
                  ? '点击播控中心的「结束直播」后，系统将自动汇总抓取本场直播的时长、观看人次、弹幕互动及收益数据。'
                  : '结束一场直播后，官方返回的数据报告将展示于此处。'}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

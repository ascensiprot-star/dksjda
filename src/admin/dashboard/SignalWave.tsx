import React from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

export interface WavePoint {
  label: string;
  value: number;
}

interface SignalWaveProps {
  mode: 'events' | 'revenue';
  onModeChange: (mode: 'events' | 'revenue') => void;
  events: WavePoint[];
  revenue: WavePoint[];
  eventTotal: number;
  revenueTotal: number;
}

const compact = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}m`;
  if (Math.abs(value) >= 1_000) return `€${(value / 1_000).toFixed(1)}k`;
  return `€${Math.round(value)}`;
};

export const SignalWave: React.FC<SignalWaveProps> = ({
  mode,
  onModeChange,
  events,
  revenue,
  eventTotal,
  revenueTotal,
}) => {
  const active = mode === 'events' ? events : revenue;
  const peak = active.reduce(
    (current, point) => (point.value > current.value ? point : current),
    { label: '—', value: 0 }
  );
  const hasMovement = active.some((point) => point.value > 0);
  const chartData = active.length > 0 ? active : [{ label: '—', value: 0 }];
  const accent = mode === 'events' ? '#2455c3' : '#0f7b5c';

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="micro-sm text-paper/55">Flow signature</p>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="font-display text-[clamp(36px,4.5vw,58px)] font-light leading-none tracking-[-0.04em] text-paper">
              {mode === 'events'
                ? eventTotal.toLocaleString('en-FI')
                : compact(revenueTotal)}
            </span>
            <span className="micro-sm text-paper/55">
              {mode === 'events' ? 'events / 24h' : 'recorded revenue'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-5 micro-sm">
          <button
            type="button"
            onClick={() => onModeChange('events')}
            className={`inline-flex items-center gap-2 transition-colors ${
              mode === 'events' ? 'text-[var(--admin-blue)]' : 'text-paper/50 hover:text-paper/75'
            }`}
          >
            <span
              className={`h-1 w-1 ${
                mode === 'events' ? 'bg-[var(--admin-blue)]' : 'bg-paper/20'
              }`}
            />
            Ingestion
          </button>
          <button
            type="button"
            onClick={() => onModeChange('revenue')}
            className={`inline-flex items-center gap-2 transition-colors ${
              mode === 'revenue' ? 'text-[var(--admin-green)]' : 'text-paper/50 hover:text-paper/75'
            }`}
          >
            <span
              className={`h-1 w-1 ${
                mode === 'revenue' ? 'bg-[var(--admin-green)]' : 'bg-paper/20'
              }`}
            />
            Revenue
          </button>
        </div>
      </div>

      <div className="relative mt-6 h-[190px] w-full">
        {hasMovement ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 12, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`wave-fill-${mode}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.22} />
                  <stop offset="68%" stopColor={accent} stopOpacity={0.05} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={accent}
                strokeWidth={1.55}
                fill={`url(#wave-fill-${mode})`}
                isAnimationActive
                animationDuration={700}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="absolute inset-x-0 top-1/2 h-px bg-paper/10" />
        )}

        {!hasMovement && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="micro-sm text-paper/50">
              {mode === 'events'
                ? 'No consented telemetry in this window'
                : 'No revenue recorded in this window'}
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between micro-sm text-paper/45">
        <span>{chartData[0]?.label || '—'}</span>
        <span className="font-mono text-[8px] tracking-[0.12em] text-paper/50">
          PEAK {peak.label} / {mode === 'events' ? peak.value : compact(peak.value)}
        </span>
        <span>{chartData[chartData.length - 1]?.label || '—'}</span>
      </div>
    </div>
  );
};

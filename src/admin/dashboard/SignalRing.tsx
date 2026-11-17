import React from 'react';

export interface RingSegment {
  label: string;
  count: number;
}

interface SignalRingProps {
  segments: RingSegment[];
  centerValue: string;
  centerLabel: string;
}

const TONES = ['#0f7b5c', '#ad6500', '#b42318', '#2455c3', '#7148b6', '#087c7c'];

export const SignalRing: React.FC<SignalRingProps> = ({
  segments,
  centerValue,
  centerLabel,
}) => {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  const radius = 82;
  const circumference = 2 * Math.PI * radius;
  const gap = total > 0 ? 2.4 : 0;
  let offset = 0;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[230px]">
      <svg viewBox="0 0 220 220" className="h-full w-full" role="img" aria-label={centerLabel}>
        <circle
          cx="110"
          cy="110"
          r={radius}
          fill="none"
          stroke="rgba(23,23,23,0.075)"
          strokeWidth="9"
        />
        {segments.map((segment, index) => {
          if (segment.count <= 0) return null;
          const length = (segment.count / total) * circumference;
          const dash = Math.max(length - gap, 0.8);
          const strokeDasharray = `${dash} ${circumference - dash}`;
          const strokeDashoffset = -offset;
          offset += length;
          return (
            <circle
              key={segment.label}
              cx="110"
              cy="110"
              r={radius}
              fill="none"
              stroke={TONES[index % TONES.length]}
              strokeWidth="9"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 110 110)"
            >
              <title>{`${segment.label}: ${segment.count}`}</title>
            </circle>
          );
        })}
        <circle cx="110" cy="110" r="67" fill="none" stroke="rgba(23,23,23,0.06)" strokeWidth="0.6" />
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-[clamp(38px,5vw,58px)] font-light leading-none tracking-[-0.04em] text-paper">
          {centerValue}
        </span>
        <span className="mt-2 max-w-[120px] micro-sm leading-relaxed text-paper/55">
          {centerLabel}
        </span>
      </div>
    </div>
  );
};

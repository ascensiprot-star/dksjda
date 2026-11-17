import React, { useMemo } from 'react';
import type { CountryPoint } from './signalGeo';

interface SignalMapProps {
  points: CountryPoint[];
}

type Polygon = Array<[number, number]>;

const LAND: Polygon[] = [
  [
    [4, 12],
    [9, 8],
    [17, 7],
    [24, 9],
    [28, 14],
    [26, 20],
    [22, 24],
    [18, 28],
    [14, 25],
    [11, 20],
    [7, 18],
  ],
  [
    [18, 28],
    [21, 29],
    [22, 32],
    [20, 33],
    [18, 31],
  ],
  [
    [22, 33],
    [28, 33],
    [31, 39],
    [29, 48],
    [26, 54],
    [22, 54],
    [20, 47],
    [20, 40],
  ],
  [
    [29, 3],
    [36, 3],
    [38, 8],
    [33, 11],
    [29, 8],
  ],
  [
    [38, 9],
    [40, 9],
    [40, 11],
    [38, 11],
  ],
  [
    [42, 11],
    [50, 9],
    [56, 10],
    [58, 14],
    [56, 20],
    [52, 22],
    [46, 22],
    [43, 18],
    [41, 14],
  ],
  [
    [42, 14],
    [44, 14],
    [44, 18],
    [42, 18],
  ],
  [
    [44, 24],
    [56, 24],
    [61, 31],
    [58, 43],
    [52, 51],
    [45, 45],
    [43, 35],
    [43, 28],
  ],
  [
    [59, 42],
    [61, 43],
    [61, 47],
    [59, 47],
  ],
  [
    [56, 8],
    [72, 5],
    [86, 7],
    [94, 14],
    [95, 23],
    [90, 30],
    [84, 33],
    [75, 31],
    [65, 27],
    [59, 23],
    [56, 17],
  ],
  [
    [69, 29],
    [74, 29],
    [76, 34],
    [73, 38],
    [70, 35],
    [68, 32],
  ],
  [
    [77, 32],
    [84, 32],
    [87, 38],
    [82, 43],
    [77, 38],
  ],
  [
    [90, 19],
    [92, 20],
    [93, 25],
    [91, 26],
    [89, 23],
  ],
  [
    [78, 43],
    [89, 43],
    [92, 49],
    [88, 54],
    [80, 53],
    [76, 47],
  ],
  [
    [93, 50],
    [95, 51],
    [96, 54],
    [94, 55],
    [92, 53],
  ],
];

const pointInPolygon = (x: number, y: number, polygon: Polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

const MAP_DOTS = (() => {
  const dots: Array<{ x: number; y: number; weight: number }> = [];
  const step = 1.35;
  for (let y = 3; y <= 54; y += step) {
    for (let x = 3; x <= 96; x += step) {
      if (LAND.some((polygon) => pointInPolygon(x, y, polygon))) {
        const weight = ((Math.round(x * 10) + Math.round(y * 10)) % 7) / 7;
        dots.push({ x, y, weight });
      }
    }
  }
  return dots;
})();

export const SignalMap: React.FC<SignalMapProps> = ({ points }) => {
  const visiblePoints = useMemo(() => points.slice(0, 24), [points]);
  const hasPoints = visiblePoints.length > 0;

  return (
    <div className="relative">
      <style>{`
        .shipping-pulse {
          transform-box: fill-box;
          transform-origin: center;
          animation: shipping-pulse 3.4s ease-out infinite;
        }
        @keyframes shipping-pulse {
          0% { opacity: .28; transform: scale(1); }
          55% { opacity: 0; transform: scale(2.4); }
          100% { opacity: 0; transform: scale(2.4); }
        }
        @media (prefers-reduced-motion: reduce) {
          .shipping-pulse { animation: none; }
        }
      `}</style>

      <svg
        viewBox="0 0 100 58"
        className="h-auto w-full"
        role="img"
        aria-label={
          hasPoints
            ? `Order geography across ${visiblePoints.length} countries`
            : 'Stylised shipping field with no recorded order geography'
        }
      >
        <g fill="rgba(36,85,195,0.18)">
          {MAP_DOTS.map((dot) => (
            <circle
              key={`${dot.x}-${dot.y}`}
              cx={dot.x}
              cy={dot.y}
              r={0.22 + dot.weight * 0.07}
              opacity={0.7 + dot.weight * 0.3}
            />
          ))}
        </g>

        <g stroke="rgba(23,23,23,0.075)" strokeWidth="0.12">
          {[8, 16, 24, 32, 40, 48].map((y) => (
            <line key={y} x1="1" y1={y} x2="99" y2={y} />
          ))}
        </g>

        {visiblePoints.map((point) => (
          <g key={point.label}>
            <title>{`${point.label}: ${point.count} order${point.count === 1 ? '' : 's'}`}</title>
            <circle
              className="shipping-pulse"
              cx={point.x}
              cy={point.y}
              r={1.7}
              fill="none"
              stroke="rgba(36,85,195,0.34)"
              strokeWidth="0.35"
            />
            <circle cx={point.x} cy={point.y} r="0.55" fill="#2455c3" />
            <circle
              cx={point.x}
              cy={point.y}
              r="1.9"
              fill="transparent"
              stroke="rgba(36,85,195,0.28)"
              strokeWidth="0.22"
            />
          </g>
        ))}
      </svg>

      {!hasPoints && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="micro-sm text-paper/50">No shipping geography recorded</p>
        </div>
      )}
    </div>
  );
};

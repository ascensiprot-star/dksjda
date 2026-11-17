import React, { useMemo, useState } from 'react';
import type { ControlCheckStatus, ControlServiceState } from '../../controlPlane/types';

interface SignalTopologyProps {
  services: ControlServiceState[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

interface NodePosition {
  x: number;
  y: number;
}

const VIEW_WIDTH = 760;
const VIEW_HEIGHT = 560;

const POSITIONS: Record<string, NodePosition> = {
  storefront: { x: 138, y: 116 },
  api: { x: 380, y: 82 },
  admin: { x: 626, y: 116 },
  auth: { x: 72, y: 284 },
  postgres: { x: 132, y: 452 },
  storage: { x: 628, y: 452 },
  realtime: { x: 286, y: 468 },
  telemetry: { x: 474, y: 468 },
  video: { x: 688, y: 284 },
};

const SHORT_NAMES: Record<string, string> = {
  storefront: 'Storefront',
  api: 'API / BFF',
  admin: 'Admin',
  auth: 'Auth',
  postgres: 'Postgres',
  storage: 'Storage',
  realtime: 'Realtime',
  telemetry: 'Telemetry',
  video: 'Video',
};

const STATUS_LABELS: Record<ControlCheckStatus, string> = {
  healthy: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  not_configured: 'Unconfigured',
  no_data: 'No data',
};

const statusFill = (status: ControlCheckStatus) => {
  if (status === 'healthy') return '#0f7b5c';
  if (status === 'degraded') return '#ad6500';
  if (status === 'down') return '#b42318';
  return '#a8a39a';
};

const statusStroke = (_status: ControlCheckStatus) => '#fffdf8';

const fallbackPosition = (index: number, total: number): NodePosition => {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  const radius = 190;
  return {
    x: VIEW_WIDTH / 2 + Math.cos(angle) * radius,
    y: VIEW_HEIGHT / 2 + Math.sin(angle) * radius,
  };
};

const edgePath = (from: NodePosition, to: NodePosition, index: number) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(Math.hypot(dx, dy), 1);
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const bend = (index % 2 === 0 ? 1 : -1) * Math.min(38, distance * 0.16);
  const midX = (from.x + to.x) / 2 + normalX * bend;
  const midY = (from.y + to.y) / 2 + normalY * bend;
  return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
};

export const SignalTopology: React.FC<SignalTopologyProps> = ({
  services,
  selectedId,
  onSelect,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const nodes = useMemo(
    () =>
      services.map((service, index) => ({
        service,
        position: POSITIONS[service.id] || fallbackPosition(index, services.length),
        label: SHORT_NAMES[service.id] || service.name,
      })),
    [services]
  );

  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.service.id, node])),
    [nodes]
  );

  const edges = useMemo(
    () =>
      nodes.flatMap((node, nodeIndex) =>
        node.service.dependencies.flatMap((dependencyId, dependencyIndex) => {
          const target = nodeById.get(dependencyId);
          if (!target) return [];
          return [
            {
              id: `${node.service.id}-${dependencyId}`,
              from: node.position,
              to: target.position,
              sourceId: node.service.id,
              targetId: dependencyId,
              path: edgePath(node.position, target.position, nodeIndex + dependencyIndex),
            },
          ];
        })
      ),
    [nodeById, nodes]
  );

  const activeId = hoveredId || selectedId;
  const nominal = services.filter((service) => service.status === 'healthy').length;

  return (
    <div className="no-scrollbar relative overflow-x-auto">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-auto w-full min-w-[560px] overflow-visible xl:min-w-0"
        role="img"
        aria-label="Actual service dependency topology from the control plane"
      >
        <defs>
          <radialGradient id="topology-bloom" cx="50%" cy="46%" r="55%">
            <stop offset="0%" stopColor="#2455c3" stopOpacity="0.10" />
            <stop offset="45%" stopColor="#2455c3" stopOpacity="0.035" />
            <stop offset="100%" stopColor="#2455c3" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="topology-edge" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2455c3" stopOpacity="0.08" />
            <stop offset="50%" stopColor="#2455c3" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#2455c3" stopOpacity="0.08" />
          </linearGradient>
          <style>{`
            .topology-flow {
              stroke-dasharray: 1 9;
              animation: topology-flow 11s linear infinite;
            }
            @keyframes topology-flow {
              to { stroke-dashoffset: -160; }
            }
            @media (prefers-reduced-motion: reduce) {
              .topology-flow { animation: none; }
            }
            .topology-node { cursor: pointer; outline: none; }
            .topology-node:focus-visible .topology-node-ring {
              stroke: #2455c3;
              stroke-width: 1;
            }
          `}</style>
        </defs>

        <ellipse
          cx={VIEW_WIDTH / 2}
          cy={VIEW_HEIGHT / 2}
          rx={355}
          ry={270}
          fill="url(#topology-bloom)"
        />

        <g fill="none" stroke="rgba(23,23,23,0.075)" strokeWidth="0.7">
          <circle cx={VIEW_WIDTH / 2} cy={VIEW_HEIGHT / 2} r="116" />
          <circle cx={VIEW_WIDTH / 2} cy={VIEW_HEIGHT / 2} r="194" />
          <circle cx={VIEW_WIDTH / 2} cy={VIEW_HEIGHT / 2} r="272" />
          <line x1="48" y1={VIEW_HEIGHT / 2} x2="712" y2={VIEW_HEIGHT / 2} />
          <line x1={VIEW_WIDTH / 2} y1="28" x2={VIEW_WIDTH / 2} y2="532" />
        </g>

        <g>
          {edges.map((edge) => {
            const isRelevant =
              !activeId || edge.sourceId === activeId || edge.targetId === activeId;
            return (
              <g key={edge.id}>
                <path
                  d={edge.path}
                  fill="none"
                  stroke="url(#topology-edge)"
                  strokeWidth={isRelevant ? 0.9 : 0.55}
                  opacity={isRelevant ? 0.9 : 0.26}
                />
                <path
                  className="topology-flow"
                  d={edge.path}
                  fill="none"
                  stroke="#2455c3"
                  strokeWidth="1.1"
                  opacity={isRelevant ? 0.34 : 0.08}
                  style={{ animationDelay: `${(edge.id.length % 7) * 0.7}s` }}
                />
              </g>
            );
          })}
        </g>

        <g transform={`translate(${VIEW_WIDTH / 2} ${VIEW_HEIGHT / 2})`}>
          <circle r="2.3" fill="#2455c3" />
          <circle r="11" fill="none" stroke="rgba(36,85,195,0.24)" strokeWidth="0.7" />
          <text
            y="-26"
            textAnchor="middle"
            fill="rgba(23,23,23,0.48)"
            fontSize="10"
            letterSpacing="2.4"
            fontFamily="Jost, sans-serif"
          >
            HOUSE CORE
          </text>
          <text
            y="36"
            textAnchor="middle"
            fill="rgba(23,23,23,0.82)"
            fontSize="12"
            letterSpacing="0.4"
            fontFamily="Jost, sans-serif"
          >
            {nominal}/{services.length} nominal
          </text>
        </g>

        <g>
          {nodes.map(({ service, position, label }) => {
            const selected = service.id === selectedId;
            const hovered = service.id === hoveredId;
            const dimmed = Boolean(activeId && activeId !== service.id && !edges.some(
              (edge) =>
                (edge.sourceId === activeId && edge.targetId === service.id) ||
                (edge.targetId === activeId && edge.sourceId === service.id)
            ));
            const status = service.status;
            return (
              <g
                key={service.id}
                className="topology-node"
                transform={`translate(${position.x} ${position.y})`}
                onClick={() => onSelect(service.id)}
                onMouseEnter={() => setHoveredId(service.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(service.id)}
                onBlur={() => setHoveredId(null)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(service.id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`${service.name}, ${STATUS_LABELS[status]}`}
                opacity={dimmed ? 0.42 : 1}
              >
                <title>
                  {`${service.name} — ${STATUS_LABELS[status]} · ${service.checks.length} checks · ${service.owner}`}
                </title>
                {(selected || hovered) && (
                  <circle
                    className="topology-node-ring"
                    r={hovered ? 21 : 18}
                    fill="rgba(36,85,195,0.07)"
                    stroke="rgba(36,85,195,0.38)"
                    strokeWidth="0.7"
                  />
                )}
                {selected && (
                  <circle
                    r="15"
                    fill="none"
                    stroke="#2455c3"
                    strokeWidth="0.9"
                    strokeDasharray="1.5 3"
                  />
                )}
                <circle
                  r="7"
                  fill={statusFill(status)}
                  stroke={statusStroke(status)}
                  strokeWidth={status === 'healthy' || status === 'degraded' ? 1 : 1.2}
                />
                {status === 'degraded' && (
                  <path d="M -7 0 A 7 7 0 0 1 0 -7 L 0 0 Z" fill="#fffdf8" />
                )}
                {status === 'down' && (
                  <path d="M -3 -3 L 3 3 M 3 -3 L -3 3" stroke="#fffdf8" strokeWidth="1.1" />
                )}
                <text
                  y="-19"
                  textAnchor="middle"
                  fill="#171717"
                  fontSize="13.5"
                  letterSpacing="0.5"
                  fontFamily="Jost, sans-serif"
                >
                  {label}
                </text>
                <text
                  y="27"
                  textAnchor="middle"
                  fill="rgba(23,23,23,0.60)"
                  fontSize="9.5"
                  letterSpacing="1.4"
                  fontFamily="Jost, sans-serif"
                >
                  {STATUS_LABELS[status].toUpperCase()}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {services.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="micro-sm text-paper/60">Topology awaiting control plane</p>
            <p className="mt-2 text-[11px] text-paper/50">
              Service dependencies appear once probes return a state.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

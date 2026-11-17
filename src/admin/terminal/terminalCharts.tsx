import React, { useEffect, useRef, useState } from 'react';

export const TERM_COLORS = ['#ffa21f', '#42c6ff', '#ececec', '#2fd35f', '#ff4b43', '#ffd60a'] as const;

export type TerminalCurrency = 'EUR' | 'USD' | 'GBP';

export const CURRENCY_META: Record<TerminalCurrency, { sym: string; rate: number }> = {
  EUR: { sym: '€', rate: 1 },
  USD: { sym: '$', rate: 1.09 },
  GBP: { sym: '£', rate: 0.85 },
};

export function escHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c)
  );
}

export function fmtN(v: number | null | undefined, d = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const sign = v < 0 && Math.abs(v) >= Math.pow(10, -d) / 2 ? '-' : '';
  return (
    sign +
    Math.abs(v).toLocaleString('en-US', {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    })
  );
}

export function nf(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return fmtN(v / 1e9, 1) + 'B';
  if (a >= 1e6) return fmtN(v / 1e6, 1) + 'M';
  if (a >= 1e4) return fmtN(v / 1e3, 0) + 'K';
  if (a >= 100) return fmtN(v, 0);
  return fmtN(v, a < 10 && a > 0 ? 2 : 1);
}

export function fmtMoney(v: number, cur: TerminalCurrency, compact = false): string {
  const { sym, rate } = CURRENCY_META[cur];
  const converted = v * rate;
  if (compact) return `${sym}${nf(converted)}`;
  return `${sym}${fmtN(converted, Math.abs(converted) < 100 && converted !== 0 ? 2 : 0)}`;
}

function niceScale(minVal: number, maxVal: number, ticksCount = 4): { lo: number; hi: number; t: number[] } {
  let mn = Number.isFinite(minVal) ? minVal : 0;
  let mx = Number.isFinite(maxVal) ? maxVal : 1;
  if (mx <= mn) {
    mx = mn + (Math.abs(mn) > 0 ? Math.abs(mn) * 0.2 : 10);
  }
  const raw = (mx - mn) / ticksCount || 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const s = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  const lo = Math.floor(mn / s) * s;
  const hi = Math.ceil(mx / s) * s;
  const t: number[] = [];
  for (let v = lo; v <= hi + 1e-9 && t.length < 14; v += s) {
    t.push(v);
  }
  return { lo, hi, t };
}

function tipRow(color: string, name: string, val: string): string {
  return `<div><i style="background:${color}"></i>${escHtml(name)}: <b>${escHtml(val)}</b></div>`;
}

export interface LineSeries {
  name: string;
  data: number[];
  c?: string;
  area?: boolean;
  dash?: boolean;
  w?: number;
}

export interface LineChartOpts {
  labels: string[];
  series: LineSeries[];
  pl?: number;
  zero?: boolean;
  fmt?: (v: number) => string;
  yf?: (v: number) => string;
}

export function lineChartSvg(w: number, h: number, o: LineChartOpts): string {
  const n = o.labels.length;
  if (!n || w < 40 || h < 40) return '';
  const pl = o.pl || 46;
  const pr = 8;
  const pt = 8;
  const pb = 18;
  const iw = Math.max(10, w - pl - pr);
  const all = o.series.flatMap((s) => s.data).filter((v) => Number.isFinite(v));
  const minAll = all.length ? Math.min(...all) : 0;
  const maxAll = all.length ? Math.max(...all) : 1;
  const { lo, hi, t } = niceScale(o.zero === false ? minAll * 0.96 : Math.min(0, minAll), Math.max(maxAll * 1.04, 1));
  const x = (i: number) => pl + (n > 1 ? (i * iw) / (n - 1) : iw / 2);
  const y = (v: number) => pt + (h - pt - pb) - ((v - lo) / Math.max(hi - lo, 1e-6)) * (h - pt - pb);

  let s = `<svg width="${w}" height="${h}">`;
  t.forEach((v) => {
    s += `<line x1="${pl}" x2="${w - pr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#222"/>`;
    s += `<text x="${pl - 5}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${escHtml((o.yf || nf)(v))}</text>`;
  });
  const ev = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 58))));
  for (let i = 0; i < n; i += ev) {
    s += `<text x="${x(i).toFixed(1)}" y="${h - 4}" text-anchor="middle">${escHtml(o.labels[i])}</text>`;
  }
  o.series.forEach((se, k) => {
    const c = se.c || TERM_COLORS[k % TERM_COLORS.length];
    if (!se.data.length) return;
    const d = se.data
      .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(Number.isFinite(v) ? v : 0).toFixed(1)}`)
      .join('');
    if (se.area) {
      s += `<path d="${d}L${x(n - 1).toFixed(1)} ${y(lo).toFixed(1)}L${x(0).toFixed(1)} ${y(lo).toFixed(1)}Z" fill="${c}" opacity="0.14"/>`;
    }
    s += `<path d="${d}" fill="none" stroke="${c}" stroke-width="${se.w || 1.5}" ${se.dash ? 'stroke-dasharray="3 3"' : ''}/>`;
  });

  const bw = iw / Math.max(n, 1);
  for (let i = 0; i < n; i++) {
    const tip =
      `<b>${escHtml(o.labels[i])}</b>` +
      o.series
        .map((se, k) =>
          tipRow(se.c || TERM_COLORS[k % TERM_COLORS.length], se.name, (o.fmt || nf)(se.data[i] ?? 0))
        )
        .join('');
    s += `<g class="t-hit"><rect x="${(x(i) - bw / 2).toFixed(1)}" y="${pt}" width="${bw.toFixed(1)}" height="${(h - pt - pb).toFixed(1)}" fill="transparent" data-tip="${escHtml(tip)}"/><line class="t-hl" x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${pt}" y2="${h - pb}" stroke="#ffa21f" stroke-dasharray="2 2"/></g>`;
  }
  return s + '</svg>';
}

export interface BarChartOpts {
  labels: string[];
  series: Array<{ name: string; data: number[]; c?: string }>;
  stacked?: boolean;
  pl?: number;
  fmt?: (v: number) => string;
  yf?: (v: number) => string;
}

export function barChartSvg(w: number, h: number, o: BarChartOpts): string {
  const n = o.labels.length;
  const m = o.series.length;
  if (!n || !m || w < 40 || h < 40) return '';
  const pl = o.pl || 46;
  const pr = 6;
  const pt = 8;
  const pb = 18;
  const iw = Math.max(10, w - pl - pr);
  const stk = Boolean(o.stacked);
  const tot = o.labels.map((_, i) =>
    stk
      ? o.series.reduce((acc, s) => acc + Math.max(0, s.data[i] || 0), 0)
      : Math.max(0, ...o.series.map((s) => s.data[i] || 0))
  );
  const mn = Math.min(0, ...o.series.flatMap((s) => s.data));
  const { lo, hi, t } = niceScale(mn, Math.max(1, ...tot) * 1.05);
  const band = iw / n;
  const xc = (i: number) => pl + band * i + band / 2;
  const bw = stk ? Math.min(band * 0.7, 40) : Math.min((band * 0.78) / m, 24);
  const y = (v: number) => pt + (h - pt - pb) - ((v - lo) / Math.max(hi - lo, 1e-6)) * (h - pt - pb);

  let s = `<svg width="${w}" height="${h}">`;
  t.forEach((v) => {
    s += `<line x1="${pl}" x2="${w - pr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#222"/>`;
    s += `<text x="${pl - 5}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${escHtml((o.yf || nf)(v))}</text>`;
  });
  const ev = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 56))));
  for (let i = 0; i < n; i += ev) {
    s += `<text x="${xc(i).toFixed(1)}" y="${h - 4}" text-anchor="middle">${escHtml(o.labels[i])}</text>`;
  }

  for (let i = 0; i < n; i++) {
    let acc = 0;
    const tip =
      `<b>${escHtml(o.labels[i])}</b>` +
      o.series
        .map((se, k) =>
          tipRow(se.c || TERM_COLORS[k % TERM_COLORS.length], se.name, (o.fmt || nf)(se.data[i] ?? 0))
        )
        .join('');
    s += `<g class="t-hit"><rect class="t-hl" x="${(pl + band * i).toFixed(1)}" y="${pt}" width="${band.toFixed(1)}" height="${(h - pt - pb).toFixed(1)}" fill="#fff" opacity="0.07"/>`;
    o.series.forEach((se, k) => {
      const v = se.data[i] || 0;
      const c = se.c || TERM_COLORS[k % TERM_COLORS.length];
      if (stk) {
        const bh = Math.max(0, y(acc) - y(acc + v) - 1);
        s += `<rect x="${(xc(i) - bw / 2).toFixed(1)}" y="${y(acc + v).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${c}"/>`;
        acc += v;
      } else {
        const yTop = v >= 0 ? y(v) : y(0);
        const bh = Math.max(1, Math.abs(y(v) - y(0)));
        s += `<rect x="${(xc(i) - (bw * m) / 2 + k * bw).toFixed(1)}" y="${yTop.toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${bh.toFixed(1)}" fill="${c}"/>`;
      }
    });
    s += `<rect x="${(pl + band * i).toFixed(1)}" y="${pt}" width="${band.toFixed(1)}" height="${(h - pt - pb).toFixed(1)}" fill="transparent" data-tip="${escHtml(tip)}"/></g>`;
  }
  return s + '</svg>';
}

export function sparkSvg(w: number, h: number, d: number[], color = '#ececec'): string {
  const vals = d.length >= 2 ? d : [0, 0];
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const x = (i: number) => 1 + (i * (w - 2)) / Math.max(vals.length - 1, 1);
  const y = (v: number) => h - 2 - ((v - mn) / (mx - mn || 1)) * (h - 4);
  const path = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  return `<svg width="${w}" height="${h}"><path d="${path}" fill="none" stroke="${color}" stroke-width="1.3"/></svg>`;
}

export function gaugeSvg(w: number, h: number, val: number, max: number, txt: string, sub: string): string {
  if (w < 60 || h < 50) return '';
  const r = Math.max(24, Math.min(w / 2 - 12, h - 32));
  const cx = w / 2;
  const cy = h - 22;
  const P = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const ratio = Math.max(0, Math.min(1, max > 0 ? val / max : 0));
  const f = Math.PI + Math.PI * ratio;
  const [x0, y0] = P(Math.PI);
  const [x1, y1] = P(f);
  const [x2, y2] = P(2 * Math.PI);
  let ticks = '';
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (Math.PI * i) / 10;
    const [ax, ay] = P(a);
    const k = r - (i % 5 ? 5 : 9);
    ticks += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${(cx + k * Math.cos(a)).toFixed(1)}" y2="${(cy + k * Math.sin(a)).toFixed(1)}" stroke="#666"/>`;
  }
  const arcColor = ratio > 0.6 ? '#ff4b43' : ratio > 0.3 ? '#ffa21f' : '#2fd35f';
  return `<svg width="${w}" height="${h}">
    <path d="M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="#222" stroke-width="11"/>
    <path d="M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="${arcColor}" stroke-width="11"/>
    ${ticks}
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" style="font-size:${Math.max(14, Math.round(r * 0.36))}px;fill:#ffa21f">${escHtml(txt)}</text>
    <text x="${cx}" y="${cy + 12}" text-anchor="middle">${escHtml(sub)}</text>
  </svg>`;
}

export interface ScatterPoint {
  x: number;
  y: number;
  r?: number;
  color: string;
  tip: string;
}

export function scatterSvg(
  w: number,
  h: number,
  pts: ScatterPoint[],
  opts: { xMax?: number; yMin?: number; yMax?: number; xFmt?: (v: number) => string; yFmt?: (v: number) => string } = {}
): string {
  if (w < 60 || h < 50) return '';
  const pl = 44;
  const pr = 12;
  const pt = 10;
  const pb = 24;
  const maxX = Math.max(10, opts.xMax || Math.max(10, ...pts.map((p) => p.x)));
  const minY = opts.yMin ?? 0;
  const maxY = Math.max(minY + 1, opts.yMax || Math.max(10, ...pts.map((p) => p.y)));
  const X = niceScale(0, maxX * 1.05, 4);
  const Y = niceScale(minY, maxY * 1.05, 4);
  const x = (v: number) => pl + ((v - X.lo) / Math.max(X.hi - X.lo, 1)) * (w - pl - pr);
  const y = (v: number) => pt + (h - pt - pb) - ((v - Y.lo) / Math.max(Y.hi - Y.lo, 1)) * (h - pt - pb);

  let s = `<svg width="${w}" height="${h}">`;
  Y.t.forEach((v) => {
    s += `<line x1="${pl}" x2="${w - pr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#222"/>`;
    s += `<text x="${pl - 5}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${escHtml((opts.yFmt || nf)(v))}</text>`;
  });
  X.t.forEach((v) => {
    s += `<text x="${x(v).toFixed(1)}" y="${h - 8}" text-anchor="middle">${escHtml((opts.xFmt || nf)(v))}</text>`;
  });
  pts.forEach((p) => {
    s += `<circle cx="${x(p.x).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="${(p.r || 5).toFixed(1)}" fill="${p.color}" fill-opacity="0.72" stroke="#000" data-tip="${escHtml(p.tip)}"/>`;
  });
  return s + '</svg>';
}

export const TerminalChart: React.FC<{
  render: (w: number, h: number) => string;
  className?: string;
}> = ({ render, className = 't-ch' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const html = size.w > 24 && size.h > 24 ? render(size.w, size.h) : '';
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
};

export const MiniBarIcon: React.FC = () => (
  <svg className="ib" width="18" height="14" viewBox="0 0 18 14">
    <rect x="1" y="1" width="2" height="12" fill="#3f9cff" />
    <rect x="5" y="5" width="2" height="8" fill="#3f9cff" />
    <rect x="9" y="3" width="2" height="10" fill="#3f9cff" />
    <rect x="13" y="7" width="2" height="6" fill="#3f9cff" />
  </svg>
);

/* Chart primitives ported from the reference operations console.
   Pure functions returning SVG/HTML strings so the visuals stay identical. */

export const PAL = ['#000', '#4a4a4a', '#858585', '#b8b8b8', '#dedede'];

export const esc = (s: unknown) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export const cnt = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return Math.round(n).toLocaleString('en-US');
};

export function nice(mn: number, mx: number, c = 4) {
  if (!Number.isFinite(mn) || !Number.isFinite(mx)) return { lo: 0, hi: 1, t: [0, 1] };
  if (mx === mn) mx = mn + 1;
  const raw = (mx - mn) / c || 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const s = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  const lo = Math.floor(mn / s) * s;
  const hi = Math.ceil(mx / s) * s;
  const t: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += s) t.push(v);
  return { lo, hi, t };
}

const tipRow = (c: string, n: string, v: string) =>
  `<div><i style="background:${c}"></i>${esc(n)}: <b>${esc(v)}</b></div>`;

type YF = (v: number) => string;

function axes(
  w: number, h: number, o: any, pl: number, pr: number, pt: number, pb: number,
  lo: number, hi: number, t: number[], n: number, xf: (i: number) => number
) {
  const iw = w - pl - pr;
  const ih = h - pt - pb;
  const y = (v: number) => pt + ih - ((v - lo) / (hi - lo || 1)) * ih;
  let s = '';
  t.forEach((v) => {
    s += `<line x1="${pl}" x2="${w - pr}" y1="${y(v)}" y2="${y(v)}" stroke="#ececec"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${(o.yf || cnt)(v)}</text>`;
  });
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 66))));
  for (let i = 0; i < n; i += every) {
    s += `<text x="${xf(i)}" y="${h - 7}" text-anchor="middle">${esc(o.labels[i] ?? '')}</text>`;
  }
  return s;
}

export interface Series { name: string; data: number[]; dash?: boolean; area?: boolean; c?: string; hatch?: boolean }

export function lineChart(w: number, h: number, o: {
  labels: string[]; series: Series[]; fmt?: YF; yf?: YF; mark?: number; zero?: boolean;
}) {
  const pl = 50, pr = 14, pt = 12, pb = 28, iw = w - pl - pr, ih = h - pt - pb, n = o.labels.length;
  const all = o.series.flatMap((s) => s.data).filter(Number.isFinite);
  if (!n || !all.length) return '';
  const nz = nice(o.zero === false ? Math.min(...all) * 0.96 : 0, Math.max(...all) * 1.02);
  const { lo, hi, t } = nz;
  const x = (i: number) => pl + (n > 1 ? (i * iw) / (n - 1) : iw / 2);
  const y = (v: number) => pt + ih - ((v - lo) / (hi - lo || 1)) * ih;
  let s = `<svg width="${w}" height="${h}">` + axes(w, h, o, pl, pr, pt, pb, lo, hi, t, n, x);
  o.series.forEach((se, k) => {
    const d = se.data.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join('');
    if (se.area) s += `<path d="${d}L${x(n - 1)} ${y(lo)}L${x(0)} ${y(lo)}Z" fill="url(#hz)"/>`;
    s += `<path d="${d}" fill="none" stroke="${se.dash ? '#9b9b9b' : se.c || PAL[Math.min(k, 4)]}" stroke-width="${se.dash ? 1.5 : 1.8}" ${se.dash ? 'stroke-dasharray="4 4"' : ''} stroke-linejoin="round"/>`;
  });
  for (let i = 0; i < n; i++) {
    const tip = `<b>${esc(o.labels[i])}</b>` + o.series.map((se, k) => tipRow(se.dash ? '#9b9b9b' : se.c || PAL[Math.min(k, 4)], se.name, (o.fmt || cnt)(se.data[i]))).join('');
    s += `<g class="hit"><rect class="cap" x="${x(i) - iw / n / 2}" y="${pt}" width="${iw / n}" height="${ih}" data-tip="${esc(tip)}"/><g class="hl" pointer-events="none"><line x1="${x(i)}" x2="${x(i)}" y1="${pt}" y2="${pt + ih}" stroke="#000" stroke-dasharray="2 3"/>${o.series.map((se, k) => `<circle cx="${x(i)}" cy="${y(se.data[i])}" r="3.6" fill="${se.dash ? '#fff' : '#000'}" stroke="${se.dash ? '#9b9b9b' : '#000'}" stroke-width="1.5"/>`).join('')}</g></g>`;
  }
  if (o.mark != null) {
    const v = o.series[0].data[o.mark];
    s += `<line x1="${x(o.mark)}" x2="${x(o.mark)}" y1="${pt}" y2="${pt + ih}" stroke="#000" stroke-dasharray="3 3"/><circle cx="${x(o.mark)}" cy="${y(v)}" r="5" fill="#000" stroke="#fff" stroke-width="2"/>`;
  }
  return s + '</svg>';
}

export function barChart(w: number, h: number, o: {
  labels: string[]; series: Series[]; fmt?: YF; yf?: YF; stacked?: boolean;
}) {
  const pl = 50, pr = 8, pt = 10, pb = 28, iw = w - pl - pr, ih = h - pt - pb;
  const n = o.labels.length, m = o.series.length, st = o.stacked;
  if (!n) return '';
  const tot = o.labels.map((_, i) => (st ? o.series.reduce((a, s) => a + (s.data[i] || 0), 0) : Math.max(...o.series.map((s) => s.data[i] || 0))));
  const { lo, hi, t } = nice(0, Math.max(...tot) * 1.04);
  const y = (v: number) => pt + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const band = iw / n;
  const bw = st ? Math.min(band * 0.64, 46) : Math.min((band * 0.74) / Math.max(1, m), 26);
  const xc = (i: number) => pl + band * i + band / 2;
  let s = `<svg width="${w}" height="${h}">` + axes(w, h, o, pl, pr, pt, pb, lo, hi, t, n, xc);
  for (let i = 0; i < n; i++) {
    const tip = `<b>${esc(o.labels[i])}</b>` + o.series.map((se, k) => tipRow(se.c || PAL[Math.min(k, 4)], se.name, (o.fmt || cnt)(se.data[i] || 0))).join('');
    s += `<g class="hit"><rect class="hl" x="${pl + band * i + 2}" y="${pt}" width="${band - 4}" height="${ih}" fill="#000" opacity=".05"/>`;
    let acc = 0;
    o.series.forEach((se, k) => {
      const v = se.data[i] || 0;
      const col = se.hatch ? 'url(#h1)' : se.c || PAL[Math.min(k, 4)];
      if (st) {
        s += `<rect x="${xc(i) - bw / 2}" y="${y(acc + v)}" width="${bw}" height="${Math.max(0, y(acc) - y(acc + v) - (k ? 1 : 0))}" fill="${col}" ${se.hatch ? 'stroke="#000"' : ''}/>`;
        acc += v;
      } else {
        s += `<rect x="${xc(i) - (bw * m) / 2 + k * bw}" y="${y(v)}" width="${Math.max(0, bw - 1.5)}" height="${Math.max(0, y(lo) - y(v))}" fill="${col}" ${se.hatch ? 'stroke="#000"' : ''} rx="1"/>`;
      }
    });
    s += `<rect class="cap" x="${pl + band * i}" y="${pt}" width="${band}" height="${ih}" data-tip="${esc(tip)}"/></g>`;
  }
  return s + '</svg>';
}

export function donutChart(w: number, h: number, o: {
  items: Array<{ l: string; v: number }>; fmt?: YF; center?: string; sub?: string;
}) {
  const r = Math.min(w, h) / 2 - 4, cxx = w / 2, cy = h / 2;
  const sw = r * 0.26, Rr = r - sw / 2;
  const tot = o.items.reduce((a, i) => a + i.v, 0) || 1;
  let a = -Math.PI / 2;
  let s = `<svg width="${w}" height="${h}">`;
  o.items.forEach((it, i) => {
    const da = (it.v / tot) * Math.PI * 2, gap = 0.02;
    const a0 = a + gap, a1 = a + da - gap;
    a += da;
    if (da <= 0) return;
    const p = (ang: number) => [cxx + Rr * Math.cos(ang), cy + Rr * Math.sin(ang)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    s += `<path d="M${x0} ${y0}A${Rr} ${Rr} 0 ${da > Math.PI ? 1 : 0} 1 ${x1} ${y1}" fill="none" stroke="${PAL[Math.min(i, 4)]}" stroke-width="${sw}" data-tip="${esc(`<b>${it.l}</b><br>${(o.fmt || cnt)(it.v)} · ${((it.v / tot) * 100).toFixed(1)}%`)}"/>`;
  });
  return s + `<text x="${cxx}" y="${cy + 4}" text-anchor="middle" style="font:400 ${Math.round(r * 0.32)}px 'Instrument Serif',serif;fill:#000">${esc(o.center || '')}</text><text x="${cxx}" y="${cy + r * 0.28}" text-anchor="middle">${esc(o.sub || '')}</text></svg>`;
}

export function sparkChart(w: number, h: number, d: number[]) {
  if (!d.length) return '';
  const mn = Math.min(...d), mx = Math.max(...d);
  const x = (i: number) => 2 + (i * (w - 4)) / Math.max(1, d.length - 1);
  const y = (v: number) => h - 3 - ((v - mn) / (mx - mn || 1)) * (h - 8);
  const p = d.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join('');
  return `<svg width="${w}" height="${h}"><path d="${p}L${x(d.length - 1)} ${h}L${x(0)} ${h}Z" fill="url(#hz)"/><path d="${p}" fill="none" stroke="#000" stroke-width="1.5"/><circle cx="${x(d.length - 1)}" cy="${y(d[d.length - 1])}" r="2.6" fill="#000"/></svg>`;
}

export function heatMap(rows: string[], cols: string[], M: Array<Array<number | null>>, o: { lw?: string; fmt?: YF } = {}) {
  const fl = M.flat().filter((v): v is number => v != null && Number.isFinite(v));
  if (!fl.length) return `<div class="hm" style="grid-template-columns:${o.lw || '46px'} repeat(${cols.length},minmax(0,1fr))"><i></i>${cols.map((c) => `<b>${c}</b>`).join('')}${rows.map((r) => `<b class="rl">${r}</b>` + cols.map(() => '<i></i>').join('')).join('')}</div>`;
  const mx = Math.max(...fl), mn = Math.min(...fl);
  return `<div class="hm" style="grid-template-columns:${o.lw || '46px'} repeat(${cols.length},minmax(0,1fr))"><i></i>${cols.map((c) => `<b>${c}</b>`).join('')}${rows.map((r, i) => `<b class="rl">${r}</b>` + M[i].map((v, j) => {
    if (v == null) return '<i></i>';
    const a = (v - mn) / (mx - mn || 1);
    return `<span class="${a > 0.5 ? 'd' : ''}" style="--a:${a.toFixed(2)}" data-tip="${esc(`<b>${r} · ${cols[j]}</b><br>${(o.fmt || cnt)(v)}`)}"></span>`;
  }).join('')).join('')}</div>`;
}

export function hbars(items: Array<{ l: string; v: number; n?: string; lt?: boolean }>, o: { fmt?: YF } = {}) {
  if (!items.length) return '<div class="mut" style="padding:8px 0;font-size:12.5px">No data in this period.</div>';
  const mx = Math.max(...items.map((i) => i.v)) || 1;
  return `<div class="hb">${items.map((i) => `<div><span class="t">${esc(i.l)}</span><span class="tr"><i class="${i.lt ? 'l' : ''}" style="width:${((i.v / mx) * 100).toFixed(1)}%"></i></span><b>${(o.fmt || cnt)(i.v)}${i.n ? `<small>${esc(i.n)}</small>` : ''}</b></div>`).join('')}</div>`;
}

export function funnelChart(steps: Array<{ l: string; v: number }>) {
  const t = steps[0]?.v || 1;
  return `<div class="fn">${steps.map((s, i) => `<div><span class="t">${esc(s.l)}</span><span class="bar ${i % 2 ? '' : ''}" style="width:${Math.max(1, (s.v / t) * 100)}%">${cnt(s.v)}</span><small>${i ? ((s.v / (steps[i - 1].v || 1)) * 100).toFixed(1) + '%' : '100%'}</small></div>`).join('')}</div>`;
}

export function progress(label: string, v: number, max: number, fmt: YF, pct: number) {
  return `<div><label><span>${esc(label)}</span><small>${fmt(v)} of ${fmt(max)}</small></label><div class="tr"><i style="width:${Math.min(100, pct)}%"></i></div></div>`;
}

export const legend = (items: Array<{ l: string; v: number }>, fmt?: YF) => {
  const t = items.reduce((a, i) => a + i.v, 0) || 1;
  return `<ul class="lst">${items.map((it, i) => `<li><i style="width:10px;height:10px;border-radius:2px;background:${PAL[Math.min(i, 4)]};flex:none;${i > 3 ? 'border:1px solid #ccc' : ''}"></i><p>${esc(it.l)}</p><b style="font-weight:500">${fmt ? fmt(it.v) : ((it.v / t) * 100).toFixed(1) + '%'}</b></li>`).join('')}</ul>`;
};

export const chartLegend = (a: Array<[string, string?, string?]>) =>
  `<div class="lg">${a.map(([n, k, c]) => `<span><i class="${k || ''}" style="${k ? '' : 'background:' + c}"></i>${esc(n)}</span>`).join('')}</div>`;

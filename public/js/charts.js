// ===== Интерактивные графики на canvas (наведение — значения и дата) =====
const nfmt = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('ru-RU', { maximumFractionDigits: d }) : '—');

// series: [{name, data, color, fill}], opts: {fmt, zero, height, stacked, labels(i,n)->string}
export function lineChart(canvas, series, opts = {}) {
  canvas._chart = { series, opts };
  if (!canvas._bound) {
    canvas._bound = true;
    canvas.addEventListener('mousemove', (e) => { const r = canvas.getBoundingClientRect(); draw(canvas, e.clientX - r.left); });
    canvas.addEventListener('mouseleave', () => draw(canvas, null));
  }
  draw(canvas, null);
}

function draw(canvas, mx) {
  const { series: raw, opts } = canvas._chart;
  const { fmt = (v) => nfmt(v), zero = false, height = 130, stacked = false, labels } = opts;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300, h = height;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.height = h + 'px'; }
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const n = Math.max(...raw.map((s) => s.data.length), 0);
  if (n < 2) { ctx.fillStyle = '#8a94a1'; ctx.font = '11px sans-serif'; ctx.fillText('Данные появятся через пару месяцев', 8, h / 2); return; }
  // выравнивание по правому краю (все ряды заканчиваются «сейчас»)
  const series = raw.map((s) => ({ ...s, data: Array(n - s.data.length).fill(NaN).concat(s.data) }));
  let tops = series.map((s) => s.data);
  if (stacked) {
    const acc = Array(n).fill(0);
    tops = series.map((s) => s.data.map((v, i) => (acc[i] += Number.isFinite(v) ? v : 0)));
  }
  const all = tops.flat().filter(Number.isFinite);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (zero || stacked) lo = Math.min(lo, 0);
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.08; hi += pad; if (!(zero || stacked) || lo < 0) lo -= pad;
  const legendH = series.length > 1 ? 14 : 0;
  const L = 46, R = 8, T = 8, B = 16 + legendH;
  const X = (i) => L + (w - L - R) * (i / (n - 1));
  const Y = (v) => T + (h - T - B) * (1 - (v - lo) / (hi - lo));
  ctx.font = '10px ui-monospace, monospace'; ctx.lineWidth = 1;
  for (let k = 0; k <= 3; k++) {
    const v = lo + (hi - lo) * k / 3, y = Y(v);
    ctx.strokeStyle = 'rgba(20,30,45,.07)'; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke();
    ctx.fillStyle = '#8a94a1'; ctx.fillText(fmt(v), 2, y + 3);
  }
  if (lo < 0 && hi > 0) { ctx.strokeStyle = 'rgba(20,30,45,.25)'; ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(w - R, Y(0)); ctx.stroke(); }
  if (labels) { ctx.fillStyle = '#a3abb6'; ctx.fillText(labels(0, n), L, h - 4 - legendH); const lr = labels(n - 1, n); ctx.fillText(lr, w - R - ctx.measureText(lr).width, h - 4 - legendH); }
  // ряды
  for (let si = series.length - 1; si >= 0; si--) {
    const s = series[si], top = tops[si], bot = stacked && si > 0 ? tops[si - 1] : null;
    ctx.beginPath(); let started = false;
    top.forEach((v, i) => { if (!Number.isFinite(v)) return; const x = X(i), y = Y(v); started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; });
    if (stacked) {
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(X(i), Y(bot ? bot[i] : 0));
      ctx.closePath(); ctx.fillStyle = s.color + 'cc'; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8; ctx.stroke();
    } else {
      ctx.strokeStyle = s.color; ctx.lineWidth = 1.8; ctx.stroke();
      if (s.fill) { const fi = top.findIndex(Number.isFinite); ctx.lineTo(X(n - 1), Y(Math.max(lo, 0))); ctx.lineTo(X(fi), Y(Math.max(lo, 0))); ctx.closePath(); ctx.fillStyle = s.color + '1f'; ctx.fill(); }
    }
  }
  // легенда
  if (legendH) {
    let x = L;
    for (const s of series) { const tw = ctx.measureText(s.name).width; if (x + tw + 20 > w) break; ctx.fillStyle = s.color; ctx.fillRect(x, h - 9, 8, 4); ctx.fillStyle = '#5b6573'; ctx.fillText(s.name, x + 11, h - 4); x += tw + 22; }
  }
  // наведение
  if (mx != null && mx >= L && mx <= w - R) {
    const i = Math.round((mx - L) / (w - L - R) * (n - 1));
    const x = X(i);
    ctx.strokeStyle = 'rgba(20,30,45,.35)'; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, h - B); ctx.stroke();
    const rows = series.map((s, si) => [s, s.data[i], tops[si][i]]).filter((r) => Number.isFinite(r[1]));
    for (const [s, , t] of rows) { ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(x, Y(t), 3, 0, 7); ctx.fill(); }
    const lines = [(labels ? labels(i, n) : '')].concat(rows.slice(0, 8).map(([s, v]) => `${s.name || ''} ${fmt(v)}`)).filter(Boolean);
    ctx.font = '11px system-ui, sans-serif';
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14, bh = lines.length * 15 + 8;
    const bx = x + 10 + bw > w ? x - 10 - bw : x + 10;
    ctx.fillStyle = 'rgba(255,255,255,.97)'; ctx.strokeStyle = '#d3d8de'; ctx.fillRect(bx, T, bw, bh); ctx.strokeRect(bx, T, bw, bh);
    lines.forEach((l, k) => { ctx.fillStyle = k === 0 && labels ? '#1f5fbf' : '#15191f'; ctx.fillText(l, bx + 7, T + 16 + k * 15); });
  }
}

export function spark(data, color = '#1f5fbf', w = 80, h = 22) {
  const d = (data || []).filter(Number.isFinite);
  if (d.length < 2) return '';
  const lo = Math.min(...d), hi = Math.max(...d), r = hi - lo || 1;
  const pts = d.map((v, i) => `${(i / (d.length - 1) * w).toFixed(1)},${(h - 2 - (v - lo) / r * (h - 4)).toFixed(1)}`).join(' ');
  const up = d[d.length - 1] >= d[0];
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color === 'auto' ? (up ? '#1a7f43' : '#b42318') : color}" stroke-width="1.5"/></svg>`;
}

// горизонтальные столбики (HTML): rows [{label, value, color, act, id, sub}]
export function hbars(rows, fmt = (v) => nfmt(v), { max } = {}) {
  const m = max || Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
  return `<div class="hbars">${rows.map((r) => `<div class="hb ${r.act ? 'click' : ''}" ${r.act ? `data-act="${r.act}" data-id="${r.id}"` : ''}>
    <span class="hb-l">${r.label}${r.sub ? ` <small>${r.sub}</small>` : ''}</span><span class="hb-b"><i style="width:${Math.abs(r.value) / m * 100}%;background:${r.color || '#1f5fbf'}"></i></span><b>${fmt(r.value)}</b></div>`).join('')}</div>`;
}

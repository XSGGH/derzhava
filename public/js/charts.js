// ===== Мини-графики на canvas =====
export function lineChart(canvas, series, { fmt = (v) => v.toFixed(1), zero = false, height = 110 } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 260, h = height;
  canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const all = series.flatMap((s) => s.data).filter(Number.isFinite);
  if (all.length < 2) { ctx.fillStyle = '#6b7685'; ctx.font = '11px sans-serif'; ctx.fillText('Недостаточно данных', 8, h / 2); return; }
  let lo = Math.min(...all), hi = Math.max(...all);
  if (zero) lo = Math.min(lo, 0);
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const L = 40, R = 6, T = 6, B = 16;
  const X = (i, n) => L + (w - L - R) * (i / Math.max(1, n - 1));
  const Y = (v) => T + (h - T - B) * (1 - (v - lo) / (hi - lo));
  ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1; ctx.fillStyle = '#7d8896'; ctx.font = '10px ui-monospace, monospace';
  for (let k = 0; k <= 3; k++) { const v = lo + (hi - lo) * k / 3; const y = Y(v); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke(); ctx.fillText(fmt(v), 2, y + 3); }
  if (lo < 0 && hi > 0) { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(w - R, Y(0)); ctx.stroke(); }
  for (const s of series) {
    const n = s.data.length; if (n < 2) continue;
    ctx.strokeStyle = s.color; ctx.lineWidth = 1.8; ctx.beginPath();
    s.data.forEach((v, i) => { const x = X(i, n), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    if (s.fill) { ctx.lineTo(X(n - 1, n), Y(lo)); ctx.lineTo(X(0, n), Y(lo)); ctx.closePath(); ctx.fillStyle = s.color + '22'; ctx.fill(); }
  }
  if (series.length > 1) {
    let x = L + 4;
    for (const s of series) { ctx.fillStyle = s.color; ctx.fillRect(x, h - 10, 8, 3); ctx.fillStyle = '#9aa4b2'; ctx.fillText(s.name, x + 11, h - 6); x += ctx.measureText(s.name).width + 24; }
  }
}

export function spark(data, color = '#e8b64a', w = 80, h = 22) {
  if (!data || data.length < 2) return '';
  const lo = Math.min(...data), hi = Math.max(...data), r = hi - lo || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1) * w).toFixed(1)},${(h - 2 - (v - lo) / r * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
}

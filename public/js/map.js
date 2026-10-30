// ===== Карта: SVG-гексы, границы, режимы отображения =====
import { W, H, neighbors, idx } from './world.js';
import { BLOCS } from './data.js';
import { atWar, hasTreaty, sanctioned } from './sim.js';

const S = 15, SQ = Math.sqrt(3);
const NS = 'http://www.w3.org/2000/svg';
const center = (c, r) => [S * SQ * (c + 0.5 * (r & 1)) + S * SQ / 2 + 4, S * 1.5 * r + S + 4];
const corners = (c, r) => { const [x, y] = center(c, r); return Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 180 * (60 * i - 30); return [x + S * Math.cos(a), y + S * Math.sin(a)]; }); };

const TERRAIN = { plain: '#c9c39a', forest: '#7f9c6b', mountain: '#9a8f86', desert: '#e0c58c', tundra: '#b8c4c8' };
const RES_COL = { oil: '#1d1d1d', gas: '#3c8fd9', iron: '#8a5a44', copper: '#d0803a', rare: '#b78cff', coal: '#4a4a4a' };

export class MapView {
  constructor(svg, onClick, onHover) {
    this.svg = svg; this.onClick = onClick; this.onHover = onHover; this.mode = 'political'; this.sel = null;
    const w = S * SQ * (W + 0.5) + 8, h = S * 1.5 * (H - 1) + 2 * S + 8;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `<defs id="mdefs"></defs><rect width="${w}" height="${h}" fill="url(#sea)"/><g id="hexes"></g><g id="borders"></g><g id="marks"></g><g id="labels"></g><g id="flows"></g>`;
    this.defs = svg.querySelector('#mdefs');
    this.defs.innerHTML = `<marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker><pattern id="sea" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#0d2236"/><path d="M0 12 Q6 9 12 12 T24 12" stroke="#16324c" fill="none"/></pattern>`;
    this.gF = svg.querySelector('#flows'); this.flows = [];
    this.gHex = svg.querySelector('#hexes'); this.gB = svg.querySelector('#borders'); this.gM = svg.querySelector('#marks'); this.gL = svg.querySelector('#labels');
    this.polys = [];
  }

  build(G) {
    this.G = G;
    this.gHex.innerHTML = '';
    for (const p of G.provs) {
      if (!p.land) { this.polys.push(null); continue; }
      const poly = document.createElementNS(NS, 'polygon');
      poly.setAttribute('points', corners(p.col, p.row).map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' '));
      poly.dataset.id = p.id;
      poly.addEventListener('click', () => this.onClick(p));
      poly.addEventListener('mousemove', (e) => this.onHover(p, e));
      poly.addEventListener('mouseleave', () => this.onHover(null));
      this.gHex.appendChild(poly); this.polys[p.id] = poly;
    }
    // штриховки оккупации
    for (const C of Object.values(G.countries)) {
      if (this.defs.querySelector('#occ-' + C.id)) continue;
      const pat = document.createElementNS(NS, 'pattern');
      pat.id = 'occ-' + C.id; pat.setAttribute('width', 6); pat.setAttribute('height', 6); pat.setAttribute('patternUnits', 'userSpaceOnUse'); pat.setAttribute('patternTransform', 'rotate(45)');
      pat.innerHTML = `<rect width="6" height="6" fill="${C.color}"/><rect width="3" height="6" fill="#111" opacity=".55"/>`;
      this.defs.appendChild(pat);
    }
    this.update();
  }

  color(p) {
    const G = this.G, C = G.countries[p.owner], P = G.countries[G.player];
    switch (this.mode) {
      case 'terrain': return TERRAIN[p.terrain];
      case 'relations': {
        if (p.owner === G.player) return '#e8b64a';
        const r = G.rel[G.player][p.owner];
        if (atWar(G, G.player, p.owner)) return '#7a0f14';
        return r >= 0 ? mix('#5c6470', '#2fbf71', r / 100) : mix('#5c6470', '#e0473e', -r / 100);
      }
      case 'bloc': return BLOCS[C.bloc].color;
      case 'good': {
        const s = C.gs?.[this.good]; if (!s) return '#3a4250';
        const net = (s.ex - s.im), m = this.goodMax || 1;
        return net >= 0 ? mix('#3a4250', '#2fbf71', Math.sqrt(net / m)) : mix('#3a4250', '#e0473e', Math.sqrt(-net / m));
      }
      case 'gdppc': { const v = Math.min(1, Math.log(C.eco.gdp / C.pop / 2) / Math.log(60)); return mix('#3a2a4a', '#f2d16b', v); }
      case 'stability': return mix('#c0392b', '#27ae60', C.pol.stability / 100);
      case 'resources': {
        const best = ['oil', 'gas', 'iron', 'copper', 'rare', 'coal'].sort((a, b) => (p.res[b] || 0) - (p.res[a] || 0))[0];
        return (p.res[best] || 0) > 0 ? RES_COL[best] : mix('#3d4a3a', '#a3c36b', Math.min(1, p.res.grain));
      }
      default: return C.color;
    }
  }

  update() {
    const G = this.G;
    for (const p of G.provs) {
      const el = this.polys[p.id]; if (!el) continue;
      const occ = p.ctrl !== p.owner;
      el.setAttribute('fill', occ && this.mode === 'political' ? `url(#occ-${p.ctrl})` : this.color(p));
      el.setAttribute('stroke', 'rgba(0,0,0,.18)');
      el.setAttribute('stroke-width', '.6');
      el.classList.toggle('sel', this.sel === p.owner);
      el.classList.toggle('mine', p.owner === G.player);
    }
    this.drawBorders(); this.drawMarks(); this.drawLabels(); this.drawFlows();
  }

  capitalXY(id) {
    const G = this.G;
    const p = G.provs.find((q) => q.capital && q.owner === id);
    if (p) return center(p.col, p.row);
    let sx = 0, sy = 0, n = 0;
    for (const q of G.provs) if (q.land && q.owner === id) { const [x, y] = center(q.col, q.row); sx += x; sy += y; n++; }
    return n ? [sx / n, sy / n] : null;
  }
  // flows: [{from, to, value, color, label}]
  setFlows(flows, good) {
    this.flows = flows || [];
    this.good = good || null;
    if (good) { this.goodMax = Math.max(1e-6, ...Object.values(this.G.countries).filter((c) => c.alive && c.gs?.[good]).map((c) => Math.abs(c.gs[good].ex - c.gs[good].im))); }
    this.update();
  }
  drawFlows() {
    if (!this.flows.length) { this.gF.innerHTML = ''; return; }
    const max = Math.max(...this.flows.map((f) => f.value));
    let h = '';
    for (const f of this.flows) {
      const a = this.capitalXY(f.from), b = this.capitalXY(f.to); if (!a || !b) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const off = Math.min(60, len * 0.25);
      const cx = (a[0] + b[0]) / 2 - dy / len * off, cy = (a[1] + b[1]) / 2 + dx / len * off;
      const sw = (1.2 + 7 * Math.sqrt(f.value / max)).toFixed(1);
      h += `<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}" stroke="${f.color || '#e8b64a'}" stroke-width="${sw}" fill="none" stroke-opacity=".82" stroke-linecap="round" marker-end="url(#arrow)" class="flow"><title>${f.label || ''}</title></path>`;
    }
    this.gF.innerHTML = h;
  }

  drawBorders() {
    const G = this.G; let d = '', dSel = '';
    const key = (pt) => pt[0].toFixed(1) + ',' + pt[1].toFixed(1);
    for (const p of G.provs) {
      if (!p.land) continue;
      const cp = corners(p.col, p.row); const ks = cp.map(key);
      for (const [c, r] of neighbors(p.col, p.row)) {
        const q = G.provs[idx(c, r)];
        if (q.land && (q.owner === p.owner || q.id < p.id)) continue;
        const kq = new Set(corners(c, r).map(key));
        const sh = cp.filter((_, i) => kq.has(ks[i]));
        if (sh.length === 2) {
          const seg = `M${sh[0][0].toFixed(1)} ${sh[0][1].toFixed(1)}L${sh[1][0].toFixed(1)} ${sh[1][1].toFixed(1)}`;
          d += seg;
          if (this.sel && (p.owner === this.sel || (q.land && q.owner === this.sel))) dSel += seg;
        }
      }
    }
    this.gB.innerHTML = `<path d="${d}" stroke="#0b0f14" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="${dSel}" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" class="selborder"/>`;
  }

  drawMarks() {
    const G = this.G; let h = '';
    for (const p of G.provs) {
      if (!p.land) continue;
      const [x, y] = center(p.col, p.row);
      if (p.capital) h += `<path d="${star(x, y, 6, 2.6)}" fill="#fff" stroke="#000" stroke-width=".8"/>`;
      if (this.mode === 'resources') {
        const ks = ['oil', 'gas', 'iron', 'copper', 'rare', 'coal'].filter((k) => (p.res[k] || 0) > 0);
        ks.forEach((k, i) => { h += `<circle cx="${x - (ks.length - 1) * 2.4 + i * 4.8}" cy="${y + 5}" r="2.1" fill="${RES_COL[k]}" stroke="#ddd" stroke-width=".5"/>`; });
      }
    }
    // фронты
    for (const w of G.wars) {
      for (const p of G.provs) {
        if (!p.land || p.ctrl === p.owner) continue;
        if (![...w.sideA, ...w.sideB].includes(p.owner)) continue;
        const [x, y] = center(p.col, p.row);
        h += `<text x="${x}" y="${y + 3}" class="occmark">✕</text>`;
      }
    }
    this.gM.innerHTML = h;
  }

  drawLabels() {
    const G = this.G; let h = '';
    for (const C of Object.values(G.countries)) {
      if (!C.alive) continue;
      let sx = 0, sy = 0, n = 0;
      for (const p of G.provs) if (p.land && p.owner === C.id) { const [x, y] = center(p.col, p.row); sx += x; sy += y; n++; }
      if (!n) continue;
      const fs = Math.max(9, Math.min(17, 5 + Math.sqrt(n) * 1.6));
      h += `<text x="${sx / n}" y="${sy / n}" font-size="${fs}" class="clabel">${C.short.toUpperCase()}</text>`;
    }
    this.gL.innerHTML = h;
  }
  setMode(m) { this.mode = m; this.update(); }
  select(id) { this.sel = id; this.update(); }
}

function star(x, y, R, r) {
  let d = '';
  for (let i = 0; i < 10; i++) { const a = Math.PI / 5 * i - Math.PI / 2; const rr = i % 2 ? r : R; d += (i ? 'L' : 'M') + (x + rr * Math.cos(a)).toFixed(1) + ' ' + (y + rr * Math.sin(a)).toFixed(1); }
  return d + 'Z';
}
export function mix(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

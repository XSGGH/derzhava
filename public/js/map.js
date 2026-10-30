// ===== Карта: органичные провинции, светлая плоская палитра, масштаб и перетаскивание =====
import { buildGeometry, cellPath, edgePath, sharedEdge, MW, MH } from './geo.js';
import { COUNTRIES, BLOCS } from './data.js';
import { capXY } from './world.js';
import { atWar } from './sim.js';

const NS = 'http://www.w3.org/2000/svg';
const TERRAIN = { plain: '#dfe5c8', forest: '#bccfae', mountain: '#d3cbc2', desert: '#efe2bf', tundra: '#dde3e6' };
const RES_COL = { oil: '#2d3440', gas: '#2f7fd1', iron: '#8a5a44', copper: '#d0803a', rare: '#8b62d9', coal: '#5b6270' };

export function mix(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const pastel = (c) => mix(c, '#ffffff', 0.32);

export class MapView {
  constructor(svg, onClick, onHover) {
    this.svg = svg; this.onClick = onClick; this.onHover = onHover;
    this.mode = 'political'; this.sel = null; this.flows = []; this.good = null;
    this.vb = { x: 0, y: 0, w: MW, h: MH };
    svg.innerHTML = `<defs id="mdefs"></defs>
      <rect x="-2000" y="-2000" width="${MW + 4000}" height="${MH + 4000}" fill="#cfdeea"/>
      <g id="shelf"></g><g id="cells"></g><g id="pborders"></g><g id="cborders"></g><g id="selb"></g>
      <g id="marks"></g><g id="labels"></g><g id="flows"></g><path id="hov" fill="none" stroke="#1d2430" stroke-width="1.4" pointer-events="none"/>`;
    this.$ = (id) => svg.querySelector('#' + id);
    this.$('mdefs').innerHTML = `<marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker>`;
    this.bindPanZoom();
  }

  build(G) {
    this.G = G;
    this.geo = buildGeometry(G.mapSeed || 20300101, COUNTRIES.map(capXY));
    const cells = this.geo.cells;
    this.paths = {}; this.els = {};
    let shelf = '';
    const g = this.$('cells'); g.innerHTML = '';
    for (const p of G.provs) {
      if (!p.land) continue;
      const d = cellPath(cells[p.id].poly);
      this.paths[p.id] = d;
      if (p.coast) shelf += d;
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('d', d); el.dataset.id = p.id;
      el.addEventListener('click', (e) => { if (!this.dragged) this.onClick(p, e); });
      el.addEventListener('mousemove', (e) => { this.$('hov').setAttribute('d', d); this.onHover(p, e); });
      el.addEventListener('mouseleave', () => { this.$('hov').setAttribute('d', ''); this.onHover(null); });
      g.appendChild(el); this.els[p.id] = el;
    }
    this.$('shelf').innerHTML = `<path d="${shelf}" fill="#dbe7f0" stroke="#dbe7f0" stroke-width="26" stroke-linejoin="round"/><path d="${shelf}" fill="#e5eef4" stroke="#e5eef4" stroke-width="11" stroke-linejoin="round"/>`;
    // рёбра
    this.edges = [];
    for (const p of G.provs) {
      if (!p.land) continue;
      for (const j of p.nb) {
        const q = G.provs[j];
        if (q.land && q.id < p.id) continue;
        const e = sharedEdge(cells[p.id].poly, cells[j].poly); if (!e) continue;
        this.edges.push({ a: p.id, b: j, d: edgePath(e[0], e[1]) });
      }
    }
    for (const C of Object.values(G.countries)) {
      const pat = document.createElementNS(NS, 'pattern');
      pat.id = 'occ-' + C.id; pat.setAttribute('width', 7); pat.setAttribute('height', 7); pat.setAttribute('patternUnits', 'userSpaceOnUse'); pat.setAttribute('patternTransform', 'rotate(45)');
      pat.innerHTML = `<rect width="7" height="7" fill="${pastel(C.color)}"/><rect width="3" height="7" fill="${C.color}"/>`;
      this.$('mdefs').appendChild(pat);
    }
    this.applyVB();
    this.update();
  }

  color(p) {
    const G = this.G, C = G.countries[p.owner];
    switch (this.mode) {
      case 'terrain': return TERRAIN[p.terrain];
      case 'relations': {
        if (p.owner === G.player) return '#f0c75e';
        if (atWar(G, G.player, p.owner)) return '#b3261e';
        const r = G.rel[G.player][p.owner];
        return r >= 0 ? mix('#e4e7eb', '#3a9d5d', r / 100) : mix('#e4e7eb', '#d9534f', -r / 100);
      }
      case 'bloc': return pastel(BLOCS[C.bloc].color);
      case 'gdppc': return mix('#eef1f4', '#2a6fdb', Math.min(1, Math.log(C.eco.gdp / C.pop / 2) / Math.log(60)));
      case 'stability': return mix('#d9534f', '#3a9d5d', C.pol.stability / 100);
      case 'resources': {
        const best = ['oil', 'gas', 'iron', 'copper', 'rare', 'coal'].sort((a, b) => (p.res[b] || 0) - (p.res[a] || 0))[0];
        return (p.res[best] || 0) > 0 ? mix(RES_COL[best], '#ffffff', 0.45) : mix('#eef0e6', '#b9cf9a', Math.min(1, p.res.grain));
      }
      case 'good': {
        const s = C.gs?.[this.good]; if (!s) return '#e4e7eb';
        const net = s.ex - s.im, m = this.goodMax || 1;
        return net >= 0 ? mix('#e4e7eb', '#2e9d5b', Math.sqrt(net / m)) : mix('#e4e7eb', '#d9534f', Math.sqrt(-net / m));
      }
      default: return pastel(C.color);
    }
  }

  update() {
    const G = this.G;
    for (const p of G.provs) {
      const el = this.els[p.id]; if (!el) continue;
      const occ = p.ctrl !== p.owner && this.mode === 'political';
      const f = occ ? `url(#occ-${p.ctrl})` : this.color(p);
      el.setAttribute('fill', f);
      el.setAttribute('stroke', occ ? '#ffffff' : f);
      el.setAttribute('stroke-width', '0.6');
    }
    let pb = '', cb = '', coast = '', sel = '';
    for (const e of this.edges) {
      const A = G.provs[e.a], B = G.provs[e.b];
      if (!B.land) { coast += e.d; if (A.owner === this.sel) sel += e.d; continue; }
      if (A.owner === B.owner) pb += e.d;
      else { cb += e.d; if (A.owner === this.sel || B.owner === this.sel) sel += e.d; }
    }
    this.$('pborders').innerHTML = `<path d="${pb}" stroke="#ffffff" stroke-opacity=".75" stroke-width=".7" fill="none"/>`;
    this.$('cborders').innerHTML = `<path d="${coast}" stroke="#8aa3b8" stroke-width="1" fill="none" stroke-linejoin="round"/><path d="${cb}" stroke="#ffffff" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="${cb}" stroke="#4b5563" stroke-width="1.1" fill="none" stroke-linecap="round" stroke-dasharray="none"/>`;
    this.$('selb').innerHTML = sel ? `<path d="${sel}" stroke="#1f5fbf" stroke-width="2.6" fill="none" stroke-linecap="round"/>` : '';
    this.drawMarks(); this.drawLabels(); this.drawFlows();
  }

  drawMarks() {
    const G = this.G; let h = '';
    for (const p of G.provs) {
      if (!p.land) continue;
      if (p.capital) h += `<circle cx="${p.x}" cy="${p.y}" r="4.2" fill="#fff" stroke="#1d2430" stroke-width="1.3"/><circle cx="${p.x}" cy="${p.y}" r="1.6" fill="#1d2430"/>`;
      if (this.mode === 'resources') {
        const ks = ['oil', 'gas', 'iron', 'copper', 'rare', 'coal'].filter((k) => (p.res[k] || 0) > 0);
        ks.forEach((k, i) => { h += `<circle cx="${p.x - (ks.length - 1) * 3 + i * 6}" cy="${p.y + (p.capital ? 8 : 0)}" r="2.5" fill="${RES_COL[k]}" stroke="#fff" stroke-width=".8"/>`; });
      }
    }
    this.$('marks').innerHTML = h;
  }

  drawLabels() {
    const G = this.G; let h = '';
    for (const C of Object.values(G.countries)) {
      if (!C.alive) continue;
      let sx = 0, sy = 0, n = 0;
      for (const p of G.provs) if (p.land && p.owner === C.id) { sx += p.x; sy += p.y; n++; }
      if (!n) continue;
      const fs = Math.max(9, Math.min(19, 5 + Math.sqrt(n) * 1.25));
      h += `<text x="${(sx / n).toFixed(0)}" y="${(sy / n + fs * 0.35).toFixed(0)}" font-size="${fs.toFixed(1)}" class="clabel">${C.short.toUpperCase()}</text>`;
    }
    this.$('labels').innerHTML = h;
  }

  capitalXY(id) {
    const G = this.G;
    const p = G.provs.find((q) => q.capital && q.owner === id);
    if (p) return [p.x, p.y];
    let sx = 0, sy = 0, n = 0;
    for (const q of G.provs) if (q.land && q.owner === id) { sx += q.x; sy += q.y; n++; }
    return n ? [sx / n, sy / n] : null;
  }
  setFlows(flows, good) {
    this.flows = flows || []; this.good = good || null;
    if (good) this.goodMax = Math.max(1e-6, ...Object.values(this.G.countries).filter((c) => c.alive && c.gs?.[good]).map((c) => Math.abs(c.gs[good].ex - c.gs[good].im)));
    this.update();
  }
  drawFlows() {
    if (!this.flows.length) { this.$('flows').innerHTML = ''; return; }
    const max = Math.max(...this.flows.map((f) => f.value));
    let h = '';
    for (const f of this.flows) {
      const a = this.capitalXY(f.from), b = this.capitalXY(f.to); if (!a || !b) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, off = Math.min(70, len * 0.22);
      const cx = (a[0] + b[0]) / 2 - dy / len * off, cy = (a[1] + b[1]) / 2 + dx / len * off;
      const sw = (1 + 6 * Math.sqrt(f.value / max)).toFixed(1);
      const d = `M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
      h += `<path d="${d}" stroke="#fff" stroke-width="${(+sw + 2).toFixed(1)}" fill="none" stroke-opacity=".8" stroke-linecap="round"/><path d="${d}" stroke="${f.color}" stroke-width="${sw}" fill="none" stroke-linecap="round" marker-end="url(#arrow)" class="flow"><title>${f.label || ''}</title></path>`;
    }
    this.$('flows').innerHTML = h;
  }
  setMode(m) { this.mode = m; this.update(); }
  select(id) { this.sel = id; this.update(); }

  // --- масштаб и перетаскивание ---
  applyVB() { const v = this.vb; this.svg.setAttribute('viewBox', `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`); }
  clampVB() {
    const v = this.vb; v.w = Math.max(220, Math.min(MW * 1.15, v.w)); v.h = v.w * MH / MW;
    v.x = Math.max(-v.w * 0.3, Math.min(MW - v.w * 0.7, v.x)); v.y = Math.max(-v.h * 0.3, Math.min(MH - v.h * 0.7, v.y));
  }
  zoom(f, cx, cy) {
    const v = this.vb, r = this.svg.getBoundingClientRect();
    const scale = Math.max(v.w / r.width, v.h / r.height);
    const ox = (r.width - v.w / scale) / 2, oy = (r.height - v.h / scale) / 2;
    const px = cx == null ? v.x + v.w / 2 : v.x + (cx - r.left - ox) * scale, py = cy == null ? v.y + v.h / 2 : v.y + (cy - r.top - oy) * scale;
    const nw = Math.max(220, Math.min(MW * 1.15, v.w * f)), k = nw / v.w;
    v.x = px - (px - v.x) * k; v.y = py - (py - v.y) * k; v.w = nw; v.h = nw * MH / MW;
    this.clampVB(); this.applyVB();
  }
  reset() { this.vb = { x: 0, y: 0, w: MW, h: MH }; this.applyVB(); }
  bindPanZoom() {
    const svg = this.svg; let drag = null;
    svg.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
    svg.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: this.vb.x, vy: this.vb.y }; this.dragged = false; });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const r = svg.getBoundingClientRect(), scale = Math.max(this.vb.w / r.width, this.vb.h / r.height);
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) { this.dragged = true; svg.classList.add('dragging'); }
      if (this.dragged) { this.vb.x = drag.vx - dx * scale; this.vb.y = drag.vy - dy * scale; this.clampVB(); this.applyVB(); }
    });
    window.addEventListener('mouseup', () => { drag = null; svg.classList.remove('dragging'); setTimeout(() => (this.dragged = false), 0); });
  }
}

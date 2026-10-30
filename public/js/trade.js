// ===== Товарные рынки и двусторонняя торговля =====
// Каждый месяц: мощности → производство (с учётом дефицита сырья) → спрос (конечный + промежуточный)
// → распределение экспорта по импортёрам (гравитация, барьеры, санкции, эмбарго) → цены → дефициты и излишки.
import { GOODS, GOOD, IO, mixFor } from './goods.js';
import { countryResources, dist as pdist, pairKey } from './world.js';
import { clamp } from './rng.js';

const H_LEN = 120;
const push = (arr, v, n = H_LEN) => { arr.push(Math.round(v * 100) / 100); if (arr.length > n) arr.shift(); };
const alive = (G) => Object.values(G.countries).filter((c) => c.alive);
const atWar = (G, a, b) => G.wars.some((w) => (w.sideA.includes(a) && w.sideB.includes(b)) || (w.sideA.includes(b) && w.sideB.includes(a)));
const sanct = (G, a, b) => !!(G.sanctions[a + '>' + b] || G.sanctions[b + '>' + a]);

export const price = (G, g) => G.goods[g].p;
export const tariffOf = (C, g) => Math.min(C.tp.tariff[g] ?? C.eco.tax.tariff, C.eco.tariffCap ?? 1);

function agriMix(G, C) {
  const m = { grain: 0.01, meat: 0.01, fruit: 0.01, cotton: 0.002 };
  for (const p of G.provs) {
    if (!p.land || p.owner !== C.id) continue;
    const lat = p.y / 640;
    m.grain += p.res.grain;
    m.meat += { plain: 0.6, forest: 0.45, tundra: 0.25, mountain: 0.3, desert: 0.1 }[p.terrain];
    m.fruit += (lat > 0.45 ? 0.8 : 0.25) * ({ plain: 1, forest: 0.6, mountain: 0.3, desert: 0.15, tundra: 0.05 }[p.terrain]);
    m.cotton += lat > 0.55 ? ({ desert: 0.7, plain: 0.5, mountain: 0.1 }[p.terrain] || 0) : 0;
  }
  const t = Object.values(m).reduce((a, b) => a + b, 0);
  for (const k in m) m[k] /= t;
  return m;
}

export function initTrade(G) {
  G.goods = {}; G.flows = {}; G.fdK = {};
  for (const g of GOODS) G.goods[g.id] = { p: 1, shock: 1, hist: [], vol: [], wprod: [] };
  const caps = {};
  for (const C of alive(G)) {
    C.mix = mixFor(C.id); C.mix.agri = agriMix(G, C);
    C.tp = { tariff: {}, duty: {}, ban: {}, emb: {}, sub: {} };
    C.gs = {}; C.gh = {}; C.ph = {}; C.trade = {};
    for (const g of GOODS) C.gh[g.id] = { prod: [], dem: [], ex: [], im: [] };
    for (const D of alive(G)) if (D.id !== C.id) C.ph[D.id] = { ex: [], im: [] };
    const r = countryResources(G, C.id);
    const rawVal = GOODS.filter((g) => g.cat === 'raw').reduce((s, g) => s + (r[g.res] || 0) * g.rw, 0);
    C.eco.miningCap = rawVal > 0 ? C.eco.miningTarget / rawVal : 0;
  }
  for (const g of GOODS) G.fdK[g.id] = 1;
  // калибровка: при ценах = 1 мировой рынок каждого товара сбалансирован
  const sd = supplyDemand(G);
  for (const g of GOODS) {
    let P = 0, D = 0;
    for (const C of alive(G)) { P += sd[C.id][g.id].prod; D += sd[C.id][g.id].dem; }
    G.fdK[g.id] = D > 0 ? P / D : 1;
  }
  tradeStep(G, true);
  for (const C of alive(G)) { C.eco.tbInit = C.eco.tbLag = (C.trade.ex - C.trade.im) / C.eco.gdp; C.eco.ex = C.trade.ex; C.eco.im = C.trade.im; }
}

function capacity(C, g, r) {
  const e = C.eco, G0 = GOOD[g];
  const occ = 1 - (e.occLoss || 0) * 0.7;
  switch (G0.cat) {
    case 'raw': return e.miningCap * e.miningEff * (r[G0.res] || 0) * G0.rw * (C.rawEff?.[g] || 1);
    case 'agri': return e.P.agri * (C.mix.agri[g] || 0) * occ;
    case 'industry': return e.P.industry * (C.mix.ind[g] || 0) * occ;
    case 'tech': return e.P.tech * (C.mix.tech[g] || 0) * occ;
    case 'services': return e.P.services * (C.mix.serv[g] || 0) * occ;
  }
  return 0;
}

// производство и спрос всех стран (без торговли)
function supplyDemand(G) {
  const out = {};
  for (const C of alive(G)) {
    const e = C.eco, r = C._res = countryResources(G, C.id);
    const o = out[C.id] = {};
    const gdppc = e.gdp / C.pop;
    const war = G.wars.some((w) => w.sideA.includes(C.id) || w.sideB.includes(C.id));
    // производство
    for (const g of GOODS) {
      const prev = C.gs?.[g.id];
      const cap = capacity(C, g.id, r);
      const sellP = prev?.pLoc ?? 1;
      // маржа: цена продукции минус стоимость сырья (относительно базовой)
      const ins = IO[g.id]; let aSum = 0, cost = 0;
      for (const [inp, a] of Object.entries(ins)) { aSum += a; cost += a * (C.gs?.[inp]?.pLoc ?? 1); }
      const m0 = 1 - aSum, m = sellP - cost;
      const marginF = aSum > 0 ? clamp(m / m0, 0.3, 1.5) : 1;
      const utilT = clamp(Math.pow(sellP, 0.2) * Math.pow(marginF, 0.35), 0.6, 1.12) * (1 - 0.6 * clamp(prev?.unsoldR || 0, 0, 1));
      const util = prev?.util != null ? prev.util + (utilT - prev.util) * 0.35 : utilT;
      const avail = prev?.avail ?? 1;
      const disrupt = Math.pow(G.goods[g.id].shock || 1, -0.6); // шоки предложения (перебои, неурожай)
      o[g.id] = { cap, prod: cap * util * avail * disrupt, F: 0, I: 0, dem: 0, util };
    }
    // спрос
    for (const g of GOODS) {
      const pl = C.gs?.[g.id]?.pLoc ?? 1;
      let F;
      if (g.arms) F = e.gdp * e.spend.defense * 0.35 * (war ? 1.6 : 1);
      else F = e.gdp * g.fd * Math.pow(clamp(gdppc / 20, 0.1, 10), g.inc || 0) * Math.pow(clamp(pl, 0.2, 8), -(g.el || 0.4));
      if (g.invest) F *= (e.investRate || 0.2) / 0.2;
      o[g.id].F = F;
    }
    for (const [out2, ins] of Object.entries(IO)) for (const [inp, a] of Object.entries(ins)) o[inp].I += a * o[out2].prod;
    for (const g of GOODS) o[g.id].dem = G.fdK[g.id] * (o[g.id].F + o[g.id].I);
  }
  return out;
}

const distCache = {};
function dist(G, a, b) {
  const k = pairKey(a, b);
  if (distCache[k] == null) {
    const ca = G.provs.find((p) => p.capital && p.owner === a) || G.provs.find((p) => p.land && p.owner === a);
    const cb = G.provs.find((p) => p.capital && p.owner === b) || G.provs.find((p) => p.land && p.owner === b);
    distCache[k] = ca && cb ? pdist(ca, cb) : 20;
  }
  return distCache[k];
}

// привлекательность канала поставок i → j для товара g
export function linkWeight(G, i, j, g) {
  const A = G.countries[i], B = G.countries[j];
  if (atWar(G, i, j)) return 0;
  if (A.tp.emb[g + '>' + j] || B.tp.emb[g + '>' + i]) return 0;
  let w = 1 / (1 + dist(G, i, j) / 8);
  if (G._borders?.[i]?.has(j)) w *= 1.5;
  if (G.treaties.trade[pairKey(i, j)]) w *= 1.35;
  if (A.bloc === B.bloc && A.bloc !== 'none') w *= 1.15;
  w *= clamp(1 + (G.rel[i][j] || 0) / 250, 0.6, 1.4);
  w *= Math.pow(1 - (A.tp.duty[g] || 0), 2) * (1 + 2 * (A.tp.sub[g] || 0));
  w *= Math.pow(clamp((A.eco.fx / (A.eco.pl || 1)) / 100, 0.3, 3), 0.6); // слабая реальная валюта — дешевле экспорт
  if (sanct(G, i, j)) w *= 0.12; // серые схемы
  return w;
}

export function tradeStep(G, init = false) {
  const L = alive(G);
  const sd = supplyDemand(G);
  for (const C of L) {
    C.trade = { ex: 0, im: 0, tariffRev: 0, dutyRev: 0, subCost: 0, exBy: {}, imBy: {}, exG: {}, imG: {} };
    for (const D of L) if (D.id !== C.id) { C.trade.exBy[D.id] = 0; C.trade.imBy[D.id] = 0; }
  }
  // санкционное давление: доля мирового ВВП, которая нас санкционирует → дисконт на экспорт, наценка на серый импорт
  const wgdp = L.reduce((a, X) => a + X.eco.gdp, 0);
  const sanctSh = {};
  for (const C of L) sanctSh[C.id] = L.reduce((a, X) => a + (X.id !== C.id && G.sanctions[X.id + '>' + C.id] ? X.eco.gdp : 0), 0) / wgdp;
  for (const C of L) C.trade.sanctSh = sanctSh[C.id];
  for (const g of GOODS) {
    const gid = g.id, P = price(G, gid);
    const S = {}, M = {};
    let sumD = 0, sumP = 0;
    for (const C of L) {
      const o = sd[C.id][gid];
      sumD += o.dem; sumP += o.prod;
      const net = o.prod - o.dem;
      S[C.id] = net > 0 && !C.tp.ban[gid] ? net : 0;
      M[C.id] = net < 0 ? -net : 0;
    }
    // распределение (итеративное пропорциональное согласование)
    const F = {}; for (const C of L) F[C.id] = {};
    const sold = {}, got = {};
    for (const C of L) { sold[C.id] = 0; got[C.id] = 0; }
    const W = {};
    for (const A of L) { W[A.id] = {}; if (S[A.id] > 0) for (const B of L) if (B.id !== A.id && M[B.id] > 0) W[A.id][B.id] = linkWeight(G, A.id, B.id, gid); }
    for (let round = 0; round < 4; round++) {
      // экспортёры предлагают остаток
      const offer = {};
      for (const A of L) {
        const left = S[A.id] - sold[A.id]; if (left <= 1e-6) continue;
        let tot = 0; const sh = {};
        for (const B of L) { const need = M[B.id] - got[B.id]; const w = W[A.id][B.id]; if (!w || need <= 1e-6) continue; sh[B.id] = need * w; tot += sh[B.id]; }
        if (tot <= 0) continue;
        for (const b in sh) (offer[b] ||= {})[A.id] = left * sh[b] / tot;
      }
      let moved = 0;
      // импортёры принимают не больше потребности
      for (const b in offer) {
        const need = M[b] - got[b];
        const tot = Object.values(offer[b]).reduce((s, v) => s + v, 0);
        const k = tot > need ? need / tot : 1;
        for (const a in offer[b]) { const v = offer[b][a] * k; F[a][b] = (F[a][b] || 0) + v; sold[a] += v; got[b] += v; moved += v; }
      }
      if (moved < 1e-4) break;
    }
    // итоги по стране
    const flows = []; let vol = 0;
    for (const A of L) for (const b in F[A.id]) { const v = F[A.id][b]; if (v > 1e-3) { flows.push([A.id, b, v * P]); vol += v * P; } }
    flows.sort((x, y) => y[2] - x[2]);
    G.flows[gid] = flows;
    for (const C of L) {
      const o = sd[C.id][gid];
      const ex = sold[C.id], im = got[C.id];
      const unsold = (o.prod > o.dem ? o.prod - o.dem : 0) - ex;
      const short = M[C.id] - im;
      const tariff = tariffOf(C, gid), duty = C.tp.duty[gid] || 0;
      const unsoldR = o.prod > 0 ? clamp(unsold / o.prod, 0, 1) : 0;
      const shortR = o.dem > 0 ? clamp(short / o.dem, 0, 1) : 0;
      let pLoc = P;
      const disc = 0.45 * sanctSh[C.id];
      if (M[C.id] > 0) pLoc = P * (1 + tariff * clamp(im / Math.max(o.dem, 1e-6), 0, 1)) * (1 + 0.8 * shortR) * (1 + 0.5 * disc * clamp(im / Math.max(o.dem, 1e-6), 0, 1));
      else if (o.prod > o.dem) pLoc = P * (1 - duty * clamp(ex / Math.max(o.prod, 1e-6), 0, 1)) * (1 - 0.5 * unsoldR) * (1 - disc * clamp(ex / Math.max(o.prod, 1e-6), 0, 1));
      C.gs[gid] = { util: o.util, cap: o.cap, prod: o.prod, dem: o.dem, F: o.F, ex, im, unsold: Math.max(0, unsold), short: Math.max(0, short), unsoldR, shortR, pLoc, avail: C.gs[gid]?.avail ?? 1 };
      const dsc = 1 - 0.45 * sanctSh[C.id];
      C.trade.ex += ex * P * dsc; C.trade.im += im * P * (1 + 0.2 * sanctSh[C.id]);
      C.trade.exG[gid] = ex * P * dsc; C.trade.imG[gid] = im * P;
      C.trade.tariffRev += im * P * tariff; C.trade.dutyRev += ex * P * duty;
      C.trade.subCost += o.prod * P * (C.tp.sub[gid] || 0);
    }
    for (const A of L) for (const b in F[A.id]) { const v = F[A.id][b] * P; A.trade.exBy[b] += v; G.countries[b].trade.imBy[A.id] += v; }
    // цена
    const gm = G.goods[gid];
    if (!init) {
      const excess = sumD > 0 ? (sumD - sumP) / sumD : 0;
      const speed = g.cat === 'raw' ? 0.12 : g.cat === 'agri' ? 0.12 : 0.08;
      gm.p = clamp(gm.p * Math.exp(speed * clamp(excess, -0.4, 0.4)), 0.2, 6);
      gm.shock += (1 - gm.shock) * 0.04;
    }
    gm.lastExcess = sumD > 0 ? (sumD - sumP) / sumD : 0;
    gm.sumD = sumD; gm.sumP = sumP;
    if (!init) { push(gm.hist, price(G, gid) * g.base, 360); push(gm.vol, vol, 240); push(gm.wprod, sumP * P, 240); }
  }
  // доступность сырья для производства, агрегаты для макроэкономики
  for (const C of L) {
    for (const g of GOODS) {
      // дефицит критичного сырья режет выпуск; мелкие компоненты частично заменимы
      const ins = IO[g.id]; let tot = 0, miss = 0;
      for (const [inp, a] of Object.entries(ins)) { tot += a; miss += a * (C.gs[inp]?.shortR || 0) * (a / (a + 0.1)); }
      const target = tot > 0 ? clamp(1 - miss / tot, 0.3, 1) : 1;
      const s0 = C.gs[g.id]; s0.avail = s0.avail + (target - s0.avail) * 0.4;
    }
    const sec = { agri: [0, 0, 0], industry: [0, 0], tech: [0, 0], services: [0, 0], raw: [0, 0, 0] };
    let cpiN = 0, cpiD = 0;
    for (const g of GOODS) {
      const s = C.gs[g.id];
      const soldQ = s.prod - s.unsold;
      const k = sec[g.cat];
      k[0] += soldQ; k[1] += s.cap;
      if (g.cat === 'raw') k[2] += soldQ * s.pLoc;
      if (g.cat === 'agri') k[2] += soldQ * Math.sqrt(s.pLoc);
      cpiN += s.F * s.pLoc; cpiD += s.F;
    }
    const U = (k) => (k[1] > 0 ? clamp(k[0] / k[1], 0.3, 1.15) : 1);
    const t = C.trade;
    t.U = { industry: U(sec.industry), tech: U(sec.tech), services: 1 - (1 - U(sec.services)) * 0.1 };
    t.agriIdx = sec.agri[1] > 0 ? clamp(sec.agri[2] / sec.agri[1], 0.3, 2) : 1;
    t.miningOut = sec.raw[2] * 1;
    t.rawPriceIdx = sec.raw[1] > 0 ? sec.raw[2] / Math.max(1e-6, sec.raw[0]) : 1;
    const cpi = cpiD > 0 ? cpiN / cpiD : 1;
    C.eco.cpiChg = C.eco.cpi ? (C.eco.cpiChg || 0) + (clamp(Math.pow(cpi / C.eco.cpi, 12) - 1, -0.5, 1.5) - (C.eco.cpiChg || 0)) * 0.2 : 0;
    C.eco.cpi = cpi;
    t.armsAvail = 1 - (C.gs.arms?.shortR || 0) * 0.7;
    t.shortIdx = GOODS.reduce((s, g) => s + (C.gs[g.id].shortR || 0) * (C.gs[g.id].F || 0), 0) / Math.max(1e-6, cpiD);
    // дрейф специализации к выгодным товарам и под субсидии
    if (!init) for (const [key, cat] of [['ind', 'industry'], ['tech', 'tech'], ['agri', 'agri'], ['serv', 'services']]) {
      const mx = C.mix[key]; let tot = 0;
      const avgP = Object.keys(mx).reduce((s, gid) => s + (C.gs[gid]?.pLoc || 1), 0) / Object.keys(mx).length;
      for (const gid in mx) { mx[gid] *= Math.exp((((C.gs[gid]?.pLoc || 1) - avgP) * 0.03 + (C.tp.sub[gid] || 0) * 0.1) / 12); tot += mx[gid]; }
      const target = key === 'serv' ? Object.values(mixFor(C.id).serv).reduce((a, b) => a + b, 0) : 1;
      for (const gid in mx) mx[gid] *= target / tot;
    }
    // добыча реагирует на цены: дорогое сырьё — новые месторождения и технологии
    if (!init) { C.rawEff ||= {}; for (const g of GOODS) if (g.cat === 'raw') C.rawEff[g.id] = clamp((C.rawEff[g.id] || 1) * Math.exp(0.07 * ((C.gs[g.id]?.pLoc || 1) - 1) / 12), 0.5, 4); }
    // история
    if (!init) {
      for (const g of GOODS) { const s = C.gs[g.id], P = price(G, g.id), h = C.gh[g.id]; push(h.prod, s.prod * P); push(h.dem, s.dem * P); push(h.ex, s.ex * P); push(h.im, s.im * P); }
      for (const d in C.ph) { push(C.ph[d].ex, C.trade.exBy[d] || 0); push(C.ph[d].im, C.trade.imBy[d] || 0); }
    }
  }
}

// сводки для интерфейса
export function worldGoodStats(G, gid) {
  const rows = alive(G).map((C) => ({ id: C.id, ...C.gs[gid] })).filter((r) => r.prod > 0.001 || r.dem > 0.001);
  return rows;
}

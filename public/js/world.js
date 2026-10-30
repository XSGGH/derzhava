// ===== Генерация карты и начального состояния мира =====
import { COUNTRIES, PARTIES, GROUPS, GOV, START_YEAR, LAW_BY_ID } from './data.js';
import { initTrade } from './trade.js';
import { makeRng, seedRng, clamp } from './rng.js';

import { buildGeometry, MW, MH } from './geo.js';

export { MW, MH };
export const capXY = (k) => ({ x: (k.cap[0] + 0.5) / 34 * MW, y: (k.cap[1] + 0.5) / 22 * MH, size: k.size });
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / 29.4; // в «шагах» провинций

export function generateMap(seed = 20300101) {
  const rng = makeRng(seed ^ 0x5bd1e995);
  const caps = COUNTRIES.map(capXY);
  const geo = buildGeometry(seed, caps);
  const provs = geo.cells.map((c, i) => ({ id: i, x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10, nb: c.nb, land: !!c.poly && c.landScore > 0.62, owner: null, ctrl: null }));
  const nearest = (x, y) => { let best = 0, bd = Infinity; for (const p of provs) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd && geo.cells[p.id].poly) { bd = d; best = p.id; } } return best; };
  const capIdx = {};
  for (const k of COUNTRIES) {
    const c = capXY(k); const i = nearest(c.x, c.y); capIdx[k.id] = i;
    provs[i].land = true; for (const j of provs[i].nb) if (geo.cells[j].poly) provs[j].land = true;
  }
  // взвешенный Дейкстра от столиц
  const dst = new Array(provs.length).fill(Infinity);
  const q = [];
  for (const k of COUNTRIES) { const i = capIdx[k.id]; dst[i] = 0; provs[i].owner = k.id; q.push([0, i, k]); }
  while (q.length) {
    q.sort((a, b) => a[0] - b[0]);
    const [d, i, k] = q.shift();
    if (d > dst[i] || provs[i].owner !== k.id) continue;
    const p = provs[i];
    for (const j of p.nb) {
      const r = provs[j]; if (!r.land) continue;
      const nd = d + (Math.hypot(r.x - p.x, r.y - p.y) / 36) * (1 + 0.7 * geo.n3(r.x, r.y)) / Math.pow(k.size, 0.9);
      if (nd < dst[j]) { dst[j] = nd; r.owner = k.id; q.push([nd, j, k]); }
    }
  }
  // острова — ближайшей стране
  for (const p of provs) if (p.land && !p.owner) {
    let best = null, bd = Infinity;
    for (const q of provs) if (q.owner) { const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2; if (d < bd) { bd = d; best = q.owner; } }
    if (bd < 160 * 160) p.owner = best; else p.land = false;
  }
  for (const p of provs) { if (!p.land) { delete p.owner; delete p.ctrl; } p.coast = p.land && p.nb.some((j) => !provs[j].land); }

  // местность и ресурсы
  const byId = Object.fromEntries(COUNTRIES.map((k) => [k.id, k]));
  for (const p of provs) {
    if (!p.land) continue;
    const lat = p.y / MH; const m = geo.n2(p.x * 1.7 + 300, p.y * 1.7 + 200);
    let t = 'plain';
    if (lat < 0.2) t = m > 0.5 ? 'tundra' : 'forest';
    else if (lat > 0.68 && byId[p.owner].res.oil > 0.5) t = m > 0.65 ? 'mountain' : 'desert';
    else if (m > 0.68) t = 'mountain';
    else if (m < 0.33) t = 'forest';
    p.terrain = t;
    const b = byId[p.owner].res;
    const res = { oil: 0, gas: 0, metals: 0, grain: 0, coal: 0, iron: 0, copper: 0, rare: 0, timber: 0 };
    const tb = { desert: [1.6, 1, 0.6], tundra: [1, 1.8, 0.8], mountain: [0.4, 0.5, 2], forest: [0.7, 0.8, 1], plain: [0.8, 0.8, 0.6] }[t];
    if (rng() < (b.oil || 0) * 0.6 * tb[0]) res.oil = 0.5 + rng();
    if (rng() < (b.gas || 0) * 0.6 * tb[1]) res.gas = 0.5 + rng();
    if (rng() < (b.metals || 0) * 0.6 * tb[2]) res.iron = 0.5 + rng();
    if (rng() < (b.metals || 0) * 0.35 * tb[2]) res.copper = 0.4 + rng();
    if (rng() < (b.rare || 0) * 0.35 * (t === 'mountain' ? 2 : 0.7)) res.rare = 0.4 + rng();
    if (rng() < (b.coal || 0) * 0.5 * ({ tundra: 1.2, forest: 1.2, mountain: 1.4, plain: 0.7, desert: 0.3 }[t])) res.coal = 0.5 + rng();
    if (t === 'forest' || t === 'tundra') res.timber = (0.3 + rng()) * (0.4 + (b.timber || 0));
    res.metals = res.iron + res.copper;
    res.grain = { plain: 1, forest: 0.45, mountain: 0.2, desert: 0.12, tundra: 0.15 }[t] * (0.7 + 0.6 * rng());
    p.res = res;
    p.popW = { plain: 1, forest: 0.7, mountain: 0.45, desert: 0.3, tundra: 0.25 }[t] * (0.6 + 0.8 * rng()) * (p.coast ? 1.25 : 1);
    p.core = p.owner; p.ctrl = p.owner;
  }
  for (const k of COUNTRIES) {
    const cp = provs[capIdx[k.id]]; cp.capital = true; cp.popW *= 5;
    for (const j of cp.nb) if (provs[j].owner === k.id) provs[j].popW *= 1.6;
    for (const key of ['oil', 'gas', 'iron', 'coal', 'rare']) {
      const bias = key === 'iron' ? k.res.metals : k.res[key];
      if ((bias || 0) > 0 && !provs.some((p) => p.owner === k.id && p.res[key] > 0)) {
        const own = provs.filter((p) => p.owner === k.id && !p.capital); const p = own[Math.floor(rng() * own.length)] || cp;
        p.res[key] = 0.8 + rng(); p.res.metals = p.res.iron + p.res.copper;
      }
    }
  }
  return provs;
}

export const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

// ---------------- Начальное состояние ----------------
export function createWorld(playerId, opts = {}) {
  const seed = opts.seed || (Date.now() & 0x7fffffff);
  seedRng(seed);
  const provs = generateMap(opts.mapSeed || 20300101);
  const G = {
    version: 2, seed, mapSeed: opts.mapSeed || 20300101, turn: 0, year: START_YEAR, month: 0, player: playerId, difficulty: opts.difficulty || 'normal',
    provs, countries: {}, rel: {}, treaties: { trade: {}, nap: {}, alliance: {} }, sanctions: {}, wars: [],
    log: [], pendingEvents: [], cooldowns: {}, gameOver: null, flags: {}, worldShock: 0, globalRate: 0.03,
  };

  for (const d of COUNTRIES) {
    const gdp = d.pop * d.gdppc;
    const laws = [...d.laws, 'reg_' + d.gov].filter((l) => LAW_BY_ID[l]);
    const groupShares = { ...Object.fromEntries(Object.entries(GROUPS).map(([g, v]) => [g, v.share])) };
    groupShares.farmers = 0.03 + d.sh.agri * 1.2;
    const tot = Object.values(groupShares).reduce((a, b) => a + b, 0);
    for (const g in groupShares) groupShares[g] /= tot;
    const C = {
      id: d.id, name: d.name, short: d.short, color: d.color, gov: d.gov, party: d.party, bloc: d.bloc, aggr: d.aggr,
      ai: d.id !== playerId, alive: true,
      pop: d.pop, popGrowthBase: d.popGrowth,
      eco: {
        P: { agri: gdp * d.sh.agri, industry: gdp * d.sh.industry, services: gdp * d.sh.services, tech: gdp * d.sh.tech },
        miningTarget: gdp * d.sh.mining, miningCap: 0, miningEff: 1, miningOut: gdp * d.sh.mining,
        gdp, gdp0: gdp, gdppc0: d.gdppc, gap: 0, infl: 0.03 + d.corruption / 2500, inflExp: 0.03 + d.corruption / 2500, fxChg: 0, pl: 1,
        rate: 0.035 + d.corruption / 2000, unemp: 0.035 + d.corruption / 2500, nairuBase: 0.035 + d.corruption / 2500,
        fx: 100, debt: d.debt * gdp, reserves: gdp * 0.1, conf: 55 - d.corruption / 5, gini: 0.27 + d.corruption / 300,
        open: d.open, impProp: 0.25, tbInit: d.tb, ex: 0, im: 0, tax: { ...d.tax }, spend: { ...d.spend }, admin: 0.04,
        printing: 0, deficit0: d.deficit, growth: 0.02, growthPc: 0.02, budget: {}, debtRate: 0.04, rating: 'BBB', shock: 0,
        tbLag: d.tb, accessLoss: 0, autoRate: true, primary0: d.deficit - d.debt * 0.04,
      },
      soc: { edu: d.edu, health: d.health, infra: d.infra, science: d.science, corruption: d.corruption, corrBase: d.corruption, freedom: GOV[d.gov].freedom },
      pol: {
        laws, groupShares, groups: {}, gmods: [], support: {}, seats: {}, coalition: [d.party], approval: 50, stability: 60,
        pc: 40, nextElection: 0, lowStab: 0, warWeariness: 0, lastElection: null, termMonths: 0,
      },
      mil: { equip: 0, mobilized: false, morale: 1 },
      hist: { gdp: [], gdppc: [], infl: [], unemp: [], approval: [], debt: [], stability: [], deficit: [], rate: [], agri: [], industry: [], services: [], tech: [], mining: [], fx: [], ex: [], im: [], rev: [], exp: [], cpi: [], conf: [] },
    };
    // выборы: случайная фаза цикла
    const every = GOV[d.gov].electionEvery; C.pol.nextElection = every ? 12 + Math.floor((d.cap[0] * 7) % (every - 12)) : 0;
    G.countries[d.id] = C;
  }
  G.base = { worldGdp: Object.values(G.countries).reduce((a, c) => a + c.eco.gdp, 0) };
  // отношения
  for (const a of COUNTRIES) {
    G.rel[a.id] = {};
    for (const b of COUNTRIES) {
      if (a.id === b.id) continue;
      G.rel[a.id][b.id] = baseRelation(G, a.id, b.id);
    }
  }
  // стартовые договоры: торговля внутри блоков, альянсы блоков
  for (const a of COUNTRIES) for (const b of COUNTRIES) {
    if (a.id >= b.id) continue;
    if (a.bloc === b.bloc && a.bloc !== 'none') { G.treaties.trade[pairKey(a.id, b.id)] = true; G.treaties.alliance[pairKey(a.id, b.id)] = true; }
  }
  G.treaties.trade[pairKey('liorna', 'valdia')] = true;
  G.treaties.trade[pairKey('kargas', 'xandria')] = true;
  G.treaties.trade[pairKey('mirena', 'aurelia')] = true;
  G.treaties.nap[pairKey('zarakhan', 'kargas')] = true;
  for (const a of COUNTRIES) for (const b of COUNTRIES) if (a.id !== b.id) G.rel[a.id][b.id] = clamp(G.rel[a.id][b.id] + (G.treaties.trade[pairKey(a.id, b.id)] ? 10 : 0), -100, 100);
  G._borders = bordersOf(G);
  initTrade(G);
  return G;
}

export function baseRelation(G, a, b) {
  const A = G.countries[a], B = G.countries[b];
  let v = 0;
  if (A.bloc === B.bloc && A.bloc !== 'none') v += 40;
  else if (A.bloc !== 'none' && B.bloc !== 'none') v -= 30;
  if (A.gov === B.gov) v += 8; else if ((A.gov === 'democracy') !== (B.gov === 'democracy')) v -= 8;
  if (PARTIES[A.party] && PARTIES[B.party]) {
    const pa = PARTIES[A.party], pb = PARTIES[B.party];
    v += 10 - 8 * (Math.abs(pa.econ - pb.econ) + Math.abs(pa.soc - pb.soc));
  }
  return clamp(Math.round(v), -100, 100);
}

const RES_KEYS = ['oil', 'gas', 'metals', 'grain', 'coal', 'iron', 'copper', 'rare', 'timber'];
export function countryResources(G, id) {
  const r = { provs: 0, popW: 0 }; for (const k of RES_KEYS) r[k] = 0;
  for (const p of G.provs) {
    if (!p.land || p.ctrl !== id) continue;
    r.provs++; r.popW += p.popW;
    for (const k of RES_KEYS) r[k] += (p.res[k] || 0) * (p.owner === id ? 1 : 0.5);
  }
  return r;
}
export function bordersOf(G) {
  const B = {};
  for (const id in G.countries) B[id] = new Set();
  for (const p of G.provs) {
    if (!p.land) continue;
    for (const j of p.nb) { const q = G.provs[j]; if (q.land && q.owner !== p.owner) B[p.owner].add(q.owner); }
  }
  return B;
}

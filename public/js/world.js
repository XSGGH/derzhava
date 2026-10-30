// ===== Генерация карты и начального состояния мира =====
import { COUNTRIES, PARTIES, GROUPS, GOV, START_YEAR, LAW_BY_ID } from './data.js';
import { initTrade } from './trade.js';
import { makeRng, seedRng, clamp } from './rng.js';

export const W = 34, H = 22;

export function neighbors(col, row) {
  const odd = row & 1;
  const d = odd
    ? [[1, 0], [0, -1], [1, -1], [-1, 0], [0, 1], [1, 1]]
    : [[1, 0], [-1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const out = [];
  for (const [dc, dr] of d) {
    const c = col + dc, r = row + dr;
    if (c >= 0 && c < W && r >= 0 && r < H) out.push([c, r]);
  }
  return out;
}
function toCube(col, row) { const x = col - (row - (row & 1)) / 2; const z = row; return [x, -x - z, z]; }
export function hexDist(a, b) {
  const [x1, y1, z1] = toCube(a[0], a[1]); const [x2, y2, z2] = toCube(b[0], b[1]);
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}
export const idx = (c, r) => r * W + c;

function valueNoise(rng, cell) {
  const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2;
  const g = Array.from({ length: gw * gh }, () => rng());
  return (x, y) => {
    const fx = x / cell, fy = y / cell; const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy; const s = (t) => t * t * (3 - 2 * t);
    const v = (i, j) => g[(j % gh) * gw + (i % gw)];
    const a = v(ix, iy) + (v(ix + 1, iy) - v(ix, iy)) * s(tx);
    const b = v(ix, iy + 1) + (v(ix + 1, iy + 1) - v(ix, iy + 1)) * s(tx);
    return a + (b - a) * s(ty);
  };
}

export function generateMap(seed = 20300101) {
  const rng = makeRng(seed);
  const n1 = valueNoise(rng, 4), n2 = valueNoise(rng, 2.5), n3 = valueNoise(rng, 3);
  const provs = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    let land = 0.55 * n1(c, r) + 0.25 * n2(c, r) - 0.2;
    for (const k of COUNTRIES) {
      const d = hexDist([c, r], k.cap); const sg = 2.2 + 2.3 * k.size;
      land += 0.75 * Math.exp(-(d * d) / (2 * sg * sg));
    }
    const ex = Math.min(c, W - 1 - c, r, H - 1 - r);
    if (ex < 2) land -= (2 - ex) * 0.25;
    provs.push({ id: idx(c, r), col: c, row: r, land: land > 0.62, owner: null, ctrl: null });
  }
  // Капиталы гарантированно — суша
  for (const k of COUNTRIES) { provs[idx(...k.cap)].land = true; for (const [c, r] of neighbors(...k.cap)) provs[idx(c, r)].land = true; }

  // Взвешенный Дейкстра от столиц
  const dist = new Array(W * H).fill(Infinity);
  const q = [];
  for (const k of COUNTRIES) { const i = idx(...k.cap); dist[i] = 0; provs[i].owner = k.id; q.push([0, i, k]); }
  while (q.length) {
    q.sort((a, b) => a[0] - b[0]);
    const [d, i, k] = q.shift();
    if (d > dist[i] || provs[i].owner !== k.id) continue;
    const p = provs[i];
    for (const [c, r] of neighbors(p.col, p.row)) {
      const j = idx(c, r); if (!provs[j].land) continue;
      const nd = d + (1 + 0.6 * n3(c, r)) / Math.pow(k.size, 0.9);
      if (nd < dist[j]) { dist[j] = nd; provs[j].owner = k.id; q.push([nd, j, k]); }
    }
  }
  // Ничейная суша → море
  for (const p of provs) if (p.land && !p.owner) p.land = false;

  // Местность и ресурсы
  const byId = Object.fromEntries(COUNTRIES.map((k) => [k.id, k]));
  const tn = valueNoise(rng, 2);
  for (const p of provs) {
    if (!p.land) continue;
    const lat = p.row / H; const m = tn(p.col, p.row);
    let t = 'plain';
    if (lat < 0.2) t = m > 0.5 ? 'tundra' : 'forest';
    else if (lat > 0.68 && byId[p.owner].res.oil > 0.5) t = m > 0.65 ? 'mountain' : 'desert';
    else if (m > 0.72) t = 'mountain';
    else if (m < 0.3) t = 'forest';
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
    p.popW = { plain: 1, forest: 0.7, mountain: 0.45, desert: 0.3, tundra: 0.25 }[t] * (0.6 + 0.8 * rng());
    p.core = p.owner; p.ctrl = p.owner;
  }
  for (const k of COUNTRIES) {
    const cp = provs[idx(...k.cap)]; cp.capital = true; cp.popW *= 5;
    for (const [c, r] of neighbors(...k.cap)) if (provs[idx(c, r)].owner === k.id) provs[idx(c, r)].popW *= 1.6;
    // у каждого ресурсного профиля — хотя бы одно месторождение
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
    version: 1, seed, turn: 0, year: START_YEAR, month: 0, player: playerId, difficulty: opts.difficulty || 'normal',
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
    for (const [c, r] of neighbors(p.col, p.row)) { const q = G.provs[idx(c, r)]; if (q.land && q.owner !== p.owner) B[p.owner].add(q.owner); }
  }
  return B;
}


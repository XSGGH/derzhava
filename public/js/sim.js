// ===== Ядро симуляции: экономика, бюджет, общество, политика, армия, войны =====
import { GROUPS, PARTIES, GOV, LAW_BY_ID, COMMODITIES, END_YEAR } from './data.js';
import { countryResources, supplies, neighbors, idx, pairKey, W } from './world.js';
import { rnd, rr, clamp, chance } from './rng.js';

export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const dateStr = (G) => `${MONTHS[G.month]} ${G.year}`;

export function log(G, text, kind = 'info', who = null) {
  G.log.unshift({ t: G.turn, d: dateStr(G), text, kind, who });
  if (G.log.length > 300) G.log.length = 300;
}

// ---------- законы → суммарные модификаторы ----------
export function lawMods(C) {
  const M = { groups: {} };
  for (const id of C.pol.laws) {
    const L = LAW_BY_ID[id]; if (!L) continue;
    for (const [k, v] of Object.entries(L.mods || {})) M[k] = (M[k] || 0) + v;
    for (const [g, v] of Object.entries(L.groups || {})) M.groups[g] = (M.groups[g] || 0) + v;
  }
  return new Proxy(M, { get: (t, k) => (k in t ? t[k] : 0) });
}

export const wars = (G, id) => G.wars.filter((w) => w.sideA.includes(id) || w.sideB.includes(id));
export const atWar = (G, a, b) => G.wars.find((w) => (w.sideA.includes(a) && w.sideB.includes(b)) || (w.sideA.includes(b) && w.sideB.includes(a)));
export const sanctioned = (G, a, b) => !!G.sanctions[a + '>' + b];
export const hasTreaty = (G, type, a, b) => !!G.treaties[type][pairKey(a, b)];
export const alive = (G) => Object.values(G.countries).filter((c) => c.alive);

// ---------- границы ----------
export function computeBorders(G) {
  const B = {};
  for (const id in G.countries) B[id] = new Set();
  for (const p of G.provs) {
    if (!p.land) continue;
    for (const [c, r] of neighbors(p.col, p.row)) {
      const q = G.provs[idx(c, r)];
      if (q.land && q.owner !== p.owner) { B[p.owner].add(q.owner); }
    }
  }
  G._borders = B;
  return B;
}
export const borders = (G, a, b) => (G._borders || computeBorders(G))[a]?.has(b);

// ---------- торговый доступ ----------
function tradeAccess(G, C) {
  let sw = 0, sm = 0, sanct = 0, world = 0;
  for (const D of alive(G)) {
    if (D.id === C.id) continue;
    world += D.eco.gdp;
    const w = Math.sqrt(D.eco.gdp) * (borders(G, C.id, D.id) ? 1.6 : 1);
    let m = 1;
    if (atWar(G, C.id, D.id)) m = 0;
    else if (sanctioned(G, C.id, D.id) || sanctioned(G, D.id, C.id)) m = 0.3;
    else if (hasTreaty(G, 'trade', C.id, D.id)) m = 1.3;
    m *= clamp(1 + (G.rel[C.id][D.id] || 0) / 300, 0.6, 1.35);
    if (sanctioned(G, D.id, C.id)) sanct += D.eco.gdp;
    sw += w; sm += w * m;
  }
  return { access: sw ? sm / sw : 1, sanctLoss: world ? sanct / world : 0 };
}

// ---------- рынки сырья ----------
function marketsStep(G) {
  const sup = supplies(G);
  const wg = alive(G).reduce((a, c) => a + c.eco.gdp, 0);
  const dRatio = wg / G.base.worldGdp;
  for (const k of Object.keys(COMMODITIES)) {
    const m = G.markets[k];
    const sRatio = Math.max(0.2, sup[k] / Math.max(0.01, G.base.supply[k]));
    const dem = k === 'grain' ? Math.pow(dRatio, 0.3) : Math.pow(dRatio, 0.6);
    const target = COMMODITIES[k].base * Math.pow(dem / sRatio, 1.8) * m.shock;
    const prev = m.price;
    m.price += (target - m.price) * 0.25;
    m.chg = (m.chg || 0) + (clamp(Math.pow(m.price / prev, 12) - 1, -0.8, 1.5) - (m.chg || 0)) * 0.15; // годовой темп изменения цены
    m.shock += (1 - m.shock) * 0.05;
    m.hist.push(Math.round(m.price * 10) / 10); if (m.hist.length > 360) m.hist.shift();
  }
}

// ---------- военная мощь ----------
export function strength(G, C) {
  const M = lawMods(C);
  const man = Math.sqrt(C.pop / 10) * (1 + M.manpower) * (C.mil.mobilized ? 1.4 : 1);
  const q = (1 + M.milQuality) * (1 + (C.soc.science - 50) / 250) * (1 + (C.eco.P.tech / C.eco.gdp - 0.05));
  return Math.sqrt(Math.max(1, C.mil.equip)) * man * q * C.mil.morale;
}

// ---------- кредитный рейтинг ----------
const RATINGS = ['D', 'CCC', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA'];
function rating(C, debtGdp, defGdp) {
  let s = 7 - debtGdp * 3.2 - Math.max(0, defGdp - 0.03) * 25 - Math.max(0, C.eco.infl - 0.05) * 12 - (60 - C.pol.stability) / 25
    - C.soc.corruption / 40 + C.eco.reserves / C.eco.gdp * 3 - C.eco.accessLoss * 6 + (C.eco.gdp / C.pop) / 40;
  return RATINGS[clamp(Math.round(s), 0, 7)];
}

// ---------- бюджет ----------
export function budget(G, C, M = lawMods(C)) {
  const e = C.eco, s = C.soc, gdp = e.gdp;
  const t = e.tax, sp = e.spend;
  const rateLoad = t.inc + (t.pay || 0) * 0.6 + t.corp * 0.5 + t.vat;
  const compl = clamp(1 - s.corruption / 220 - Math.max(0, rateLoad - 0.9) * 0.4 + M.compliance, 0.35, 1.05);
  const tariff = Math.min(t.tariff, M.tariffCap || 1);
  const rev = {
    inc: t.inc * 0.42 * gdp * compl * (1 + M.incBoost) * (1 - e.unemp * 0.6),
    pay: (t.pay || 0) * 0.42 * gdp * compl * (1 - e.unemp * 0.6),
    corp: t.corp * 0.16 * gdp * Math.max(0.3, 1 + e.gap * 2) * compl,
    vat: t.vat * 0.5 * gdp * compl,
    res: Math.min(0.9, t.res * (1 + M.resRent)) * e.miningOut,
    tariff: tariff * e.im,
  };
  const nWars = wars(G, C.id).length;
  const exp = {
    social: Math.max(0, sp.social - M.socialSave) * gdp,
    health: sp.health * gdp, edu: sp.edu * gdp, infra: sp.infra * gdp,
    defense: sp.defense * gdp, security: sp.security * gdp, science: sp.science * gdp,
    subsidies: (sp.subAgri + sp.subInd + sp.subTech) * gdp,
    admin: e.admin * gdp * (1 + s.corruption / 200),
    programs: M.spendExtra * gdp,
    war: (0.015 * nWars + (C.mil.mobilized ? 0.012 : 0)) * gdp,
    interest: Math.max(0, e.debt) * e.debtRate,
  };
  const R = Object.values(rev).reduce((a, b) => a + b, 0);
  const X = Object.values(exp).reduce((a, b) => a + b, 0);
  return { rev, exp, R, X, deficit: X - R, deficitGdp: (X - R) / gdp, revGdp: R / gdp, compl, printed: e.printing * gdp };
}

// ---------- экономический шаг ----------
function econStep(G, C, M) {
  const e = C.eco, s = C.soc, pol = C.pol;
  const r = countryResources(G, C.id);
  let ownedW = 0, ctrlW = 0;
  for (const p of G.provs) if (p.land && p.owner === C.id) { ownedW += p.popW; if (p.ctrl === C.id) ctrlW += p.popW; }
  const occLoss = ownedW ? 1 - ctrlW / ownedW : 0;
  e.occLoss = occLoss;
  const acc = tradeAccess(G, C);
  if (e.access0 == null) e.access0 = acc.access;
  e.accessLoss = clamp((e.access0 - acc.access) / e.access0, 0, 1);
  e.sanctLoss = acc.sanctLoss;
  const nWars = wars(G, C.id).length;
  const mk = G.markets;

  // добыча
  const pv = r.oil * mk.oil.price / 80 + r.gas * mk.gas.price / 300 + r.metals * mk.metals.price / 100;
  e.miningOut = e.miningCap * e.miningEff * pv * (1 - 0.45 * acc.sanctLoss);
  const grainIdx = Math.pow(mk.grain.price / 250, 0.5) * (e.grain0 ? clamp(r.grain / e.grain0, 0.2, 1.6) : 1);
  const energyIdx = (mk.oil.price / 80 + mk.gas.price / 300) / 2;
  const energyExporter = (e.miningTarget / e.gdp0) > 0.12;

  // потенциальный рост
  const realRate = e.rate - e.inflExp;
  const invest = clamp(0.2 + (e.conf - 50) / 500 - 0.6 * (realRate - 0.02) - 0.4 * (e.tax.corp - 0.2) + M.invest - 0.05 * acc.sanctLoss, 0.08, 0.38);
  e.investRate = invest;
  const gdppc = e.gdp / C.pop;
  const burden = e.budget.revGdp ?? 0.3;
  const conv = 0.03 * clamp(1 - gdppc / 50, -0.5, 1) * (1 - s.corruption / 200);
  const popG = C.pop_g || C.popGrowthBase;
  const base = 0.01 + conv + 0.0002 * (s.edu - 60) + 0.0002 * (s.infra - 60) + 0.00012 * (s.science - 50)
    - 0.00015 * (s.corruption - 35) + 0.25 * (invest - 0.2) - 0.05 * Math.max(0, burden - 0.38)
    + M.growth - 0.035 * e.accessLoss - 0.012 * nWars + 0.7 * popG;
  const share = (k) => Math.max(0.005, e.P[k] / e.gdp);
  const sub = (v, k) => Math.min(0.025, 0.2 * v / share(k));
  const g = {
    agri: base - 0.004 + M.growthAgri + sub(e.spend.subAgri, 'agri'),
    industry: base + M.growthInd + sub(e.spend.subInd, 'industry') - (energyExporter ? 0 : 0.02 * (energyIdx - 1)),
    services: base + 0.003,
    tech: base + 0.003 + M.growthTech + 0.0003 * (s.science - 50) + 0.0002 * (s.edu - 60) + 0.0001 * (s.freedom - 50) + sub(e.spend.subTech, 'tech') - 0.03 * e.accessLoss,
  };
  for (const k in g) { g[k] = clamp(g[k], -0.12, 0.14); e.P[k] *= 1 + g[k] / 12; }
  e.sectorG = g;
  const pvNorm = (r.oil + r.gas + r.metals) > 0 ? pv / (r.oil + r.gas + r.metals) : 1;
  e.miningEff *= 1 + clamp(0.004 + 0.025 * (pvNorm - 1) + M.growthMining + 0.1 * (invest - 0.2) - 0.03 * e.accessLoss, -0.1, 0.1) / 12;

  // разрыв выпуска (спрос)
  const defGdp = e.budget.deficitGdp != null ? (e.budget.deficit - e.budget.exp.interest) / e.gdp : e.deficit0 - 0.02;
  const gapT = clamp(
    0.35 * (defGdp - e.primary0) - 0.6 * (realRate - 0.015) + 0.4 * (e.tbLag - e.tbInit) + (e.conf - 55) / 1200
    - 0.02 * nWars - 0.5 * occLoss - 0.06 * e.accessLoss + e.shock + G.worldShock + e.printing * 0.8, -0.22, 0.09);
  e.gap += (gapT - e.gap) * 0.2;
  e.shock *= 0.9;

  const prevGdp = e.gdp;
  const nonMining = e.P.agri * grainIdx + e.P.industry + e.P.services + e.P.tech;
  e.gdp = Math.max(1, (nonMining * (1 + e.gap) + e.miningOut * (1 + 0.3 * e.gap)) * (1 - occLoss * 0.7));
  e.growthM = e.gdp / prevGdp - 1;

  // инфляция
  const cred = clamp(0.25 + M.credibility + (C.gov === 'democracy' ? 0.08 : 0), 0.1, 0.8);
  const food = 0.12 * (mk.grain.chg || 0);
  const energy = energyExporter ? 0 : 0.07 * ((mk.oil.chg || 0) + (mk.gas.chg || 0)) / 2;
  const piStar = (1 - cred) * e.inflExp + cred * 0.03 + 0.5 * e.gap + 1.2 * e.printing + 0.3 * Math.max(-0.1, e.fxReal || 0) + food + energy + M.inflation + 0.04 * e.accessLoss;
  e.infl = clamp(e.infl + (piStar - e.infl) * 0.25, -0.05, 4);
  e.inflExp += (e.infl - e.inflExp) * (0.13 - cred * 0.08);
  e.pl = (e.pl || 1) * Math.exp((e.infl - 0.03) / 12);

  // ставка
  if (C.ai || M.rateRule > 0 || e.autoRate) {
    const rt = clamp(0.015 + e.infl + 0.5 * (e.infl - 0.03) + 0.5 * e.gap + ((e.fxReal || 0) > 0.1 ? 0.02 : 0), 0.0, 0.6);
    e.rate += (rt - e.rate) * 0.3;
  }

  // безработица
  const nairu = clamp(e.nairuBase + M.nairu + 0.0008 * (60 - s.edu), 0.02, 0.2);
  e.nairu = nairu;
  e.unemp = clamp(e.unemp + (nairu - 0.5 * e.gap + 0.3 * occLoss - e.unemp) * 0.15, 0.015, 0.45);

  // торговля
  const realFx = e.fx / e.pl;
  const comp = Math.pow(realFx / 100, 0.4);
  const open = clamp(e.open * (1 + M.openness), 0.05, 0.9);
  const tradables = e.P.industry + e.P.tech + 0.12 * e.P.services + 0.25 * e.P.agri * grainIdx;
  const tariff = Math.min(e.tax.tariff, M.tariffCap || 1);
  e.ex = tradables * open * acc.access * comp * (1 + e.gap * 0.3) + 0.7 * e.miningOut;
  const impBase = e.gdp * Math.pow(1 - tariff, 1.5) / comp * Math.max(0.3, acc.access) * (1 + 0.5 * e.gap);
  if (!e.calibrated) { e.impProp = clamp((e.ex - e.tbInit * e.gdp) / impBase, 0.05, 1.2); }
  e.im = impBase * e.impProp;
  const tb = (e.ex - e.im) / e.gdp;
  e.tbLag += (tb - e.tbLag) * 0.2;
  e.reserves = Math.max(0, e.reserves + (e.ex - e.im) / 12 * 0.2);

  // курс
  const flight = 0.06 * e.accessLoss + 0.04 * nWars + Math.max(0, 40 - pol.stability) / 800 + Math.max(0, e.debt / e.gdp - 1) * 0.03;
  const dfx = clamp((e.infl - 0.03) - 0.4 * (realRate - 0.015) - 0.6 * (e.tbLag - e.tbInit) + flight + (e.fxPush || 0), -0.4, 1.5);
  e.fxPush = 0;
  e.fx *= Math.exp(dfx / 12);
  e.fxChg += (dfx - e.fxChg) * 0.3;
  e.fxReal = (e.fxReal || 0) + ((dfx - (e.infl - 0.03)) - (e.fxReal || 0)) * 0.3; // реальная девальвация

  // бюджет
  if (!e.calibrated) {
    // калибровка: подбираем страховые взносы (и аппарат) так, чтобы стартовый дефицит совпал с историческим
    e.admin = 0.03; e.tax.pay = 0;
    const b0 = budget(G, C, M);
    const need = b0.X - e.deficit0 * e.gdp - b0.R;
    const base = 0.42 * e.gdp * b0.compl * (1 - e.unemp * 0.6);
    let pay = need / base;
    if (pay < 0) { e.admin = clamp(0.03 + need / e.gdp / (1 + s.corruption / 200), 0.012, 0.03); pay = 0; }
    e.tax.pay = Math.round(clamp(pay, 0, 0.3) * 1000) / 1000;
    if (pay > 0.3) {
      // взносов не хватает — урезаем расходные статьи пропорционально
      const gapAbs = (pay - 0.3) * base;
      const sp = Object.values(e.spend).reduce((a, b) => a + b, 0) * e.gdp;
      const k = clamp(1 - gapAbs / sp, 0.6, 1);
      for (const key in e.spend) e.spend[key] = Math.round(e.spend[key] * k * 10000) / 10000;
    }
    e.calibrated = true;
  }
  const b = budget(G, C, M);
  e.budget = b;
  // ВВП в модели реальный, поэтому инфляция «съедает» реальную стоимость долга
  e.debt += (b.deficit - b.printed) / 12 - Math.max(0, e.debt) * clamp(e.infl, -0.05, 1) / 12;
  const debtGdp = e.debt / e.gdp;
  const prem = 0.05 * Math.max(0, debtGdp - 0.6) + 0.03 * Math.max(0, (50 - pol.stability) / 50) + 0.04 * acc.sanctLoss + Math.max(0, e.infl - 0.04) * 0.4;
  const drT = clamp(0.5 * e.rate + 0.5 * G.globalRate + prem, 0.005, 0.5);
  e.debtRate += (drT - e.debtRate) / 24;
  e.rating = rating(C, debtGdp, b.deficitGdp);

  // доверие бизнеса
  const confT = clamp(52 + (e.growth - 0.02) * 400 - Math.max(0, e.infl - 0.04) * 150 - s.corruption / 4 + 12 - 25 * e.accessLoss - 10 * nWars
    + M.confidence + (pol.stability - 50) / 4 - Math.max(0, debtGdp - 1) * 15, 0, 100);
  e.conf += (confT - e.conf) * 0.1;

  // неравенство
  const giniT = clamp(0.25 + s.corruption / 400 - 0.6 * (Math.max(0, e.spend.social - M.socialSave) - 0.1) + M.gini + 0.3 * Math.max(0, e.unemp - 0.06) + Math.max(0, e.infl - 0.08) * 0.2, 0.2, 0.65);
  e.gini += (giniT - e.gini) * 0.02;

  // рост г/г
  const h = C.hist.gdp;
  e.growth = h.length >= 12 ? e.gdp / h[h.length - 12] - 1 : Math.pow(1 + e.growthM, 12) - 1;
  const hp = C.hist.gdppc;
  e.growthPc = hp.length >= 12 ? (e.gdp / C.pop) / hp[hp.length - 12] - 1 : e.growth - popG;
  e.realIncome = e.growthPc - Math.max(0, e.infl - e.inflExp) * 0.5 - (e.fxChg > 0.2 ? 0.02 : 0);

  // накопленные фонды (образование, здравоохранение…)
  const effK = 1 - s.corruption / 300;
  const stockT = {
    edu: (15 + e.spend.edu * 1300) * effK + M.eduT,
    health: (15 + e.spend.health * 1100) * effK + M.healthT,
    infra: (15 + e.spend.infra * 1600) * effK + M.infraT,
    science: (10 + e.spend.science * 2500) * effK + M.sciT,
  };
  for (const k in stockT) s[k] = clamp(s[k] + (clamp(stockT[k], 0, 100) - s[k]) / 40, 0, 100);
  const corrT = clamp(s.corrBase + M.corruption - (s.freedom - GOV[C.gov].freedom) * 0.1 - 200 * (e.spend.security - 0.02), 3, 95);
  s.corruption += (corrT - s.corruption) / 60;
  s.freedom += (clamp(GOV[C.gov].freedom + M.freedom, 2, 98) - s.freedom) * 0.2;

  // население
  const pg = C.popGrowthBase + M.popGrowth + (s.health - 60) / 12000 - (e.unemp > 0.15 ? 0.002 : 0) - 0.004 * nWars - (e.gdp / C.pop < 4 ? 0.002 : 0);
  C.pop_g = pg;
  C.pop *= 1 + pg / 12;
}

// ---------- политика ----------
export function indicators(C, M) {
  const e = C.eco, s = C.soc, sp = e.spend;
  return {
    unemp: clamp(100 - (e.unemp - 0.04) * 600, 0, 100),
    infl: clamp(100 - Math.max(0, e.infl - 0.03) * 450 - Math.max(0, -e.infl) * 300, 0, 100),
    growth: clamp(50 + e.realIncome * 900, 0, 100),
    social: clamp(20 + Math.max(0, sp.social - M.socialSave) * 450, 0, 100),
    health: s.health, edu: s.edu, science: s.science,
    tax: clamp(100 - (e.tax.corp * 140 + e.tax.inc * 60 + (e.tax.pay || 0) * 40 + e.tax.vat * 60), 0, 100),
    freedom: s.freedom, corruption: 100 - s.corruption,
    defense: clamp(20 + sp.defense * 1300, 0, 100),
    security: clamp(30 + sp.security * 2200, 0, 100),
    agri: clamp(30 + sp.subAgri * 3500, 0, 100),
    tariff: clamp(30 + e.tax.tariff * 350, 0, 100),
    rate: clamp(100 - e.rate * 500, 0, 100),
    ineq: clamp(100 - (e.gini - 0.25) * 250, 0, 100),
    order: clamp(100 - s.freedom * 0.6, 0, 100),
    war: 50 + (C._warScore || 0) / 2,
  };
}
const GROUP_W = {
  workers: { unemp: 0.3, infl: 0.2, social: 0.15, ineq: 0.15, growth: 0.2 },
  farmers: { agri: 0.35, infl: 0.15, growth: 0.15, social: 0.15, tariff: 0.2 },
  business: { tax: 0.3, corruption: 0.2, growth: 0.25, rate: 0.15, freedom: 0.1 },
  intel: { freedom: 0.3, edu: 0.2, corruption: 0.2, growth: 0.15, science: 0.15 },
  pensioners: { social: 0.35, health: 0.3, infl: 0.25, security: 0.1 },
  siloviki: { defense: 0.4, security: 0.3, order: 0.2, war: 0.1 },
  youth: { unemp: 0.3, edu: 0.25, freedom: 0.25, growth: 0.2 },
};
export const IND_NAMES = {
  unemp: 'Занятость', infl: 'Цены', growth: 'Реальные доходы', social: 'Соцвыплаты', health: 'Здравоохранение', edu: 'Образование',
  science: 'Наука', tax: 'Налоги', freedom: 'Свободы', corruption: 'Честность власти', defense: 'Оборона', security: 'Порядок',
  agri: 'Аграрные субсидии', tariff: 'Защита рынка', rate: 'Доступность кредита', ineq: 'Равенство', order: 'Жёсткая власть', war: 'Военные успехи',
};
export function groupTargets(C, M) {
  const I = indicators(C, M); const out = {};
  for (const [g, w] of Object.entries(GROUP_W)) {
    let v = 0; for (const [k, wt] of Object.entries(w)) v += I[k] * wt;
    out[g] = { base: v, drivers: Object.entries(w).map(([k, wt]) => ({ k, name: IND_NAMES[k], v: I[k], wt })) };
  }
  return out;
}

function politicsStep(G, C, M) {
  const pol = C.pol, e = C.eco;
  const T = groupTargets(C, M);
  pol.termMonths = (pol.termMonths || 0) + 1;
  pol.fatigue = Math.min(14, pol.termMonths / 20); // усталость от власти
  // временные модификаторы
  const tmp = {};
  pol.gmods = pol.gmods.filter((m) => { m.m--; tmp[m.g] = (tmp[m.g] || 0) + m.v; return m.m > 0; });
  let appr = 0, wsum = 0, wappr = 0;
  const gw = GOV[C.gov].eliteWeight;
  for (const g in GROUPS) {
    const target = clamp(T[g].base + (M.groups[g] || 0) + (tmp[g] || 0) - pol.warWeariness * 0.25 - pol.fatigue, 0, 100);
    const cur = pol.groups[g] ?? target;
    pol.groups[g] = cur + (target - cur) * 0.1;
    appr += pol.groupShares[g] * pol.groups[g];
    const w = pol.groupShares[g] * (GROUPS[g].elite ? gw * 3 : 1);
    wsum += w; wappr += w * pol.groups[g];
  }
  pol.approval = appr;
  const weighted = wappr / wsum;
  const stT = clamp(0.55 * weighted + 22 + M.stability + (e.spend.security - 0.02) * 400 - Math.max(0, e.unemp - 0.08) * 150
    - Math.max(0, e.infl - 0.1) * 60 - pol.warWeariness * 0.3 - Math.max(0, e.gini - 0.4) * 80 + (C.gov === 'autocracy' ? 4 : 0), 0, 100);
  pol.stability += (stT - pol.stability) * 0.12;
  pol.pc = clamp(pol.pc + 0.8 + pol.approval / 45 + GOV[C.gov].pcBonus - M.pcUpkeep, 0, 200);
  pol.warWeariness = Math.max(0, pol.warWeariness + (wars(G, C.id).length ? 1 : -1.5));

  // поддержка партий
  const sup = {}; for (const p in PARTIES) sup[p] = 0;
  for (const g in GROUPS) {
    const sat = pol.groups[g];
    const v = {}; let tot = 0;
    for (const p in PARTIES) {
      let a = PARTIES[p].aff[g] ?? 0.5;
      if (p === C.party) a *= Math.pow(sat / 50, 1.6);
      else if (pol.coalition.includes(p)) a *= Math.pow(sat / 50, 0.6);
      else a *= Math.pow((100 - sat) / 50, 0.5);
      a *= 1 + (pol.mood?.[p] || 0);
      v[p] = a; tot += a;
    }
    for (const p in PARTIES) sup[p] += pol.groupShares[g] * v[p] / tot;
  }
  pol.support = sup;
  for (const p in pol.mood || {}) pol.mood[p] *= 0.98;
  if (!Object.keys(pol.seats).length) { pol.seats = allocateSeats(C, sup, true); pol.coalition = formCoalition(pol.seats, C.party) || [C.party]; }

  // выборы
  const every = GOV[C.gov].electionEvery;
  if (every) {
    pol.nextElection--;
    if (pol.nextElection <= 0) election(G, C, M);
  }
  // кризисы власти
  if (pol.stability < 22) pol.lowStab++; else pol.lowStab = Math.max(0, pol.lowStab - 1);
}

export function allocateSeats(C, sup, initial = false) {
  const M = lawMods(C);
  const s = { ...sup };
  if (C.gov === 'autocracy') { for (const p in s) s[p] *= 0.4; s[C.party] = 0.7; }
  else s[C.party] += M.electionBonus + (initial ? 0.05 : 0);
  let tot = 0; for (const p in s) { if (s[p] < 0.05) s[p] = 0; tot += s[p]; }
  const seats = {}; let used = 0; const rem = [];
  for (const p in s) { const q = s[p] / tot * 100; seats[p] = Math.floor(q); used += seats[p]; rem.push([q - seats[p], p]); }
  rem.sort((a, b) => b[0] - a[0]);
  for (let i = 0; used < 100; i++, used++) seats[rem[i % rem.length][1]]++;
  return seats;
}

const ideoDist = (a, b) => Math.abs(PARTIES[a].econ - PARTIES[b].econ) + Math.abs(PARTIES[a].soc - PARTIES[b].soc);

export function formCoalition(seats, lead) {
  const coal = [lead]; let n = seats[lead] || 0;
  const cands = Object.keys(seats).filter((p) => p !== lead && seats[p] > 0 && ideoDist(p, lead) < 1.5).sort((a, b) => ideoDist(a, lead) - ideoDist(b, lead));
  for (const p of cands) { if (n >= 51) break; coal.push(p); n += seats[p]; }
  return n >= 51 ? coal : null;
}

export function election(G, C, M = lawMods(C)) {
  const pol = C.pol;
  pol.nextElection = GOV[C.gov].electionEvery;
  const seats = allocateSeats(C, pol.support);
  pol.seats = seats;
  const old = C.party;
  let coal = formCoalition(seats, C.party);
  const largest = Object.keys(seats).sort((a, b) => seats[b] - seats[a])[0];
  const pct = Object.entries(seats).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${PARTIES[p].short} ${n}`).join(', ');
  pol.lastElection = { d: dateStr(G), seats: { ...seats } };
  if (!coal && largest === C.party) coal = [C.party]; // правительство меньшинства
  if (!coal || (seats[C.party] < seats[largest] * 0.6)) {
    // власть меняется
    const newCoal = formCoalition(seats, largest) || [largest];
    if (!C.ai) {
      G.gameOver = { reason: 'election', text: `Ваша партия проиграла выборы (${pct}). Власть переходит к партии «${PARTIES[largest].name}».` };
      log(G, `Выборы проиграны: ${pct}`, 'bad', C.id);
      return;
    }
    C.party = largest; pol.coalition = newCoal; pol.termMonths = 0;
    log(G, `${C.short}: на выборах победила партия «${PARTIES[largest].name}» (${pct}).`, 'world', C.id);
    if (old !== largest) for (const D of alive(G)) if (D.id !== C.id) G.rel[C.id][D.id] = G.rel[D.id][C.id] = clamp(G.rel[C.id][D.id] + rr(-10, 10), -100, 100);
  } else {
    pol.coalition = coal;
    if (!C.ai) log(G, `Выборы выиграны! Парламент: ${pct}. Коалиция: ${coal.map((p) => PARTIES[p].short).join(' + ')}.`, 'good', C.id);
    else log(G, `${C.short}: правящая партия «${PARTIES[C.party].name}» сохранила власть.`, 'world', C.id);
    pol.pc += 15;
  }
}

// ---------- законы: голосование ----------
export function lawVote(G, C, lawId, repeal = false) {
  const L = LAW_BY_ID[lawId]; const pol = C.pol;
  const sign = repeal ? -1 : 1;
  const res = { yes: 0, no: 0, parties: {} };
  for (const [p, n] of Object.entries(pol.seats)) {
    if (!n) continue;
    const P = PARTIES[p];
    let score = sign * (P.econ * L.econ + P.soc * L.soc);
    let yes;
    if (p === C.party) yes = true;
    else if (pol.coalition.includes(p)) yes = score > -0.55;
    else yes = score > 0.15;
    if (C.gov === 'autocracy') yes = true;
    res.parties[p] = yes; if (yes) res.yes += n; else res.no += n;
  }
  res.pass = res.yes >= 51;
  res.lobbyCost = res.pass ? 0 : Math.ceil((51 - res.yes) * 1.5);
  return res;
}

export function lawAvailable(C, lawId) {
  const L = LAW_BY_ID[lawId];
  if (C.pol.laws.includes(lawId)) return { ok: false, why: 'Уже действует' };
  if (L.notGov && C.gov === L.notGov) return { ok: false, why: 'Недоступно при текущем режиме' };
  return { ok: true };
}

export function passLaw(G, C, lawId, { lobby = false } = {}) {
  const L = LAW_BY_ID[lawId]; const pol = C.pol;
  const av = lawAvailable(C, lawId); if (!av.ok) return { ok: false, msg: av.why };
  const v = lawVote(G, C, lawId);
  const cost = L.pc + (lobby ? v.lobbyCost : 0);
  if (!v.pass && !lobby) return { ok: false, msg: 'Не хватает голосов в парламенте' };
  if (pol.pc < cost) return { ok: false, msg: `Нужно ${cost} политкапитала` };
  pol.pc -= cost;
  if (L.excl) pol.laws = pol.laws.filter((id) => LAW_BY_ID[id].excl !== L.excl);
  pol.laws.push(lawId);
  if (L.regime) {
    C.gov = L.regime;
    pol.laws = pol.laws.filter((id) => !(LAW_BY_ID[id].notGov && LAW_BY_ID[id].notGov === C.gov));
    pol.nextElection = GOV[C.gov].electionEvery || 0;
    if (C.gov === 'autocracy') pol.seats = allocateSeats(C, pol.support);
    for (const D of alive(G)) if (D.id !== C.id) {
      const d = (D.gov === C.gov ? 10 : -10) + (D.gov === 'democracy' && C.gov !== 'democracy' ? -15 : 0);
      G.rel[C.id][D.id] = G.rel[D.id][C.id] = clamp(G.rel[C.id][D.id] + d, -100, 100);
    }
  }
  if (L.onPass?.cash) C.eco.debt -= L.onPass.cash * C.eco.gdp;
  pol.mood = pol.mood || {};
  for (const p in PARTIES) pol.mood[p] = clamp((pol.mood[p] || 0) + 0.08 * (PARTIES[p].econ * L.econ + PARTIES[p].soc * L.soc), -0.5, 0.5);
  log(G, `Принят закон «${L.name}»${lobby ? ' (продавлен через лоббирование)' : ''}.`, 'law', C.id);
  return { ok: true, msg: `Закон «${L.name}» принят` };
}

export function repealLaw(G, C, lawId, { lobby = false } = {}) {
  const L = LAW_BY_ID[lawId]; const pol = C.pol;
  if (L.regime) return { ok: false, msg: 'Режим меняется принятием другой конституционной реформы' };
  const v = lawVote(G, C, lawId, true);
  const cost = Math.ceil(L.pc * 0.6) + (lobby ? v.lobbyCost : 0);
  if (!v.pass && !lobby) return { ok: false, msg: 'Парламент против отмены' };
  if (pol.pc < cost) return { ok: false, msg: `Нужно ${cost} политкапитала` };
  pol.pc -= cost;
  pol.laws = pol.laws.filter((id) => id !== lawId);
  log(G, `Отменён закон «${L.name}».`, 'law', C.id);
  return { ok: true, msg: `Закон «${L.name}» отменён` };
}

export function addGroupMod(C, g, v, m) { C.pol.gmods.push({ g, v, m }); }

// ---------- армия ----------
function milStep(G, C) {
  const e = C.eco;
  const eff = 1 - C.soc.corruption / 250;
  if (!C.mil.equip) C.mil.equip = e.spend.defense * e.gdp * eff / 0.1;
  C.mil.equip += (e.spend.defense * e.gdp * eff) / 12 - C.mil.equip * 0.1 / 12;
  if (!wars(G, C.id).length) { C.mil.morale += (1 - C.mil.morale) * 0.1; }
}

// ---------- войны ----------
export function declareWar(G, att, def) {
  const A = G.countries[att], D = G.countries[def];
  const sideA = [att], sideB = [def];
  for (const X of alive(G)) {
    if (X.id === att || X.id === def) continue;
    if (hasTreaty(G, 'alliance', X.id, def) && !hasTreaty(G, 'alliance', X.id, att)) sideB.push(X.id);
    else if (hasTreaty(G, 'alliance', X.id, att) && !hasTreaty(G, 'alliance', X.id, def) && X.aggr > 0.3 && G.rel[X.id][def] < -20) sideA.push(X.id);
  }
  const w = { id: 'w' + G.turn + att + def, a: att, b: def, sideA, sideB, score: 0, months: 0, capOcc: 0 };
  G.wars.push(w);
  delete G.treaties.trade[pairKey(att, def)]; delete G.treaties.nap[pairKey(att, def)];
  for (const x of sideA) for (const y of sideB) {
    G.rel[x][y] = G.rel[y][x] = -100;
    delete G.treaties.trade[pairKey(x, y)];
  }
  // мировая реакция
  for (const X of alive(G)) {
    if (sideA.includes(X.id) || sideB.includes(X.id)) continue;
    G.rel[X.id][att] = G.rel[att][X.id] = clamp(G.rel[X.id][att] - 20, -100, 100);
  }
  log(G, `${A.short} объявляет войну ${D.short}!${sideB.length > 1 ? ' На стороне обороняющихся: ' + sideB.slice(1).map((i) => G.countries[i].short).join(', ') + '.' : ''}`, 'war');
  G._borders = null;
  return w;
}

function sideStrength(G, side, lead) {
  return side.reduce((s, id) => s + strength(G, G.countries[id]) * (id === lead ? 1 : 0.55), 0);
}

function occupy(G, w, fromSide, toSide, n) {
  // fromSide захватывает n провинций стороны toSide
  for (let i = 0; i < n; i++) {
    const cands = [];
    for (const p of G.provs) {
      if (!p.land || !toSide.includes(p.ctrl)) continue;
      const adj = neighbors(p.col, p.row).some(([c, r]) => fromSide.includes(G.provs[idx(c, r)].ctrl));
      if (adj) cands.push(p);
    }
    if (!cands.length) return;
    cands.sort((a, b) => (a.capital ? 1 : 0) - (b.capital ? 1 : 0) + (rnd() - 0.5) * 0.5);
    const p = cands[0]; if (p.capital && w.score < 75 && w.score > -75) return;
    // захватчик — тот член fromSide, кто соседствует
    const adjCtrl = neighbors(p.col, p.row).map(([c, r]) => G.provs[idx(c, r)].ctrl).find((x) => fromSide.includes(x));
    p.ctrl = adjCtrl;
  }
}
function liberate(G, side, n) {
  for (let i = 0; i < n; i++) {
    const p = G.provs.find((p) => p.land && side.includes(p.owner) && p.ctrl !== p.owner
      && neighbors(p.col, p.row).some(([c, r]) => G.provs[idx(c, r)].ctrl === p.owner));
    if (!p) return; p.ctrl = p.owner;
  }
}

function warsStep(G) {
  for (const w of [...G.wars]) {
    w.months++;
    const sA = sideStrength(G, w.sideA, w.a), sB = sideStrength(G, w.sideB, w.b) * 1.15;
    const d = 9 * (sA - sB) / (sA + sB) + rr(-2.5, 2.5);
    w.score = clamp(w.score + d, -100, 100);
    for (const id of [...w.sideA, ...w.sideB]) {
      const C = G.countries[id]; C.mil.equip *= 0.993;
      const mine = w.sideA.includes(id) ? w.score : -w.score;
      C._warScore = mine;
      C.mil.morale = clamp(C.mil.morale + mine / 4000, 0.6, 1.2);
      C.pol.warWeariness += mine < 0 ? 0.6 : 0.1;
    }
    const countOcc = (by, of) => G.provs.filter((p) => p.land && of.includes(p.owner) && by.includes(p.ctrl)).length;
    const ownedB = G.provs.filter((p) => p.land && w.sideB.includes(p.owner)).length;
    const ownedA = G.provs.filter((p) => p.land && w.sideA.includes(p.owner)).length;
    const tA = w.score > 10 ? Math.floor((w.score - 10) / 90 * ownedB * 0.6) : 0;
    const tB = w.score < -10 ? Math.floor((-w.score - 10) / 90 * ownedA * 0.6) : 0;
    const oA = countOcc(w.sideA, w.sideB), oB = countOcc(w.sideB, w.sideA);
    if (oA < tA) occupy(G, w, w.sideA, w.sideB, Math.min(2, tA - oA)); else if (oA > tA) liberate(G, w.sideB, 1);
    if (oB < tB) occupy(G, w, w.sideB, w.sideA, Math.min(2, tB - oB)); else if (oB > tB) liberate(G, w.sideA, 1);
    const capB = G.provs.find((p) => p.capital && p.owner === w.b), capA = G.provs.find((p) => p.capital && p.owner === w.a);
    if (w.score >= 99 || (capB && capB.ctrl !== w.b && w.score > 85)) { makePeace(G, w, 'annexA'); continue; }
    if (w.score <= -99 || (capA && capA.ctrl !== w.a && w.score < -85)) { makePeace(G, w, 'annexB'); continue; }
    // ИИ-ИИ войны заканчиваются сами
    const involvesPlayer = [...w.sideA, ...w.sideB].includes(G.player);
    if (!involvesPlayer && w.months > 6 && chance(0.04 + Math.abs(w.score) / 1500 + w.months / 600)) {
      makePeace(G, w, w.score > 30 ? 'annexA' : w.score < -30 ? 'annexB' : 'white');
    }
  }
}

export function makePeace(G, w, type) {
  const winners = type === 'annexA' ? w.sideA : type === 'annexB' ? w.sideB : [];
  const losers = type === 'annexA' ? w.sideB : type === 'annexB' ? w.sideA : [];
  const gained = {};
  for (const p of G.provs) {
    if (!p.land) continue;
    const involved = w.sideA.includes(p.owner) || w.sideB.includes(p.owner);
    if (!involved || p.ctrl === p.owner) continue;
    if (losers.includes(p.owner) && winners.includes(p.ctrl)) {
      transferProvince(G, p, p.ctrl); gained[p.ctrl] = (gained[p.ctrl] || 0) + 1;
    } else p.ctrl = p.owner;
  }
  G.wars = G.wars.filter((x) => x !== w);
  for (const id of [...w.sideA, ...w.sideB]) { G.countries[id]._warScore = 0; G.countries[id].mil.mobilized = G.countries[id].mil.mobilized && wars(G, id).length > 0; }
  const A = G.countries[w.a], B = G.countries[w.b];
  const txt = type === 'white' ? `Мир между ${A.short} и ${B.short} на условиях статус-кво.`
    : `Мирный договор: ${G.countries[winners[0]].short} аннексирует ${Object.values(gained).reduce((a, b) => a + b, 0)} пров. у ${G.countries[losers[0]].short}.`;
  log(G, txt, 'war');
  for (const x of w.sideA) for (const y of w.sideB) G.rel[x][y] = G.rel[y][x] = type === 'white' ? -40 : -70;
  for (const id in G.countries) {
    const C = G.countries[id];
    if (C.alive && !G.provs.some((p) => p.land && p.owner === id)) {
      C.alive = false; log(G, `${C.name} прекращает существование.`, 'war');
      if (id === G.player) G.gameOver = { reason: 'conquered', text: 'Ваше государство было полностью поглощено противником.' };
    }
  }
  G._borders = null;
}

export function transferProvince(G, p, to) {
  const from = p.owner; const F = G.countries[from], T = G.countries[to];
  let ownedW = 0; for (const q of G.provs) if (q.land && q.owner === from) ownedW += q.popW;
  const frac = ownedW ? p.popW / ownedW : 0;
  const popMove = F.pop * frac;
  F.pop -= popMove; T.pop += popMove;
  for (const k in F.eco.P) { const mv = F.eco.P[k] * frac; F.eco.P[k] -= mv; T.eco.P[k] += mv * 0.6; }
  if (p.capital) { p.capital = false; }
  p.owner = to; p.ctrl = to;
  if (to === G.player) T.pol.gmods.push({ g: 'siloviki', v: 5, m: 24 });
}

// ---------- главный шаг ----------
import { aiStep } from './ai.js';
import { eventsStep } from './events.js';

export function step(G) {
  if (G.gameOver) return;
  G.turn++;
  computeBorders(G);
  marketsStep(G);
  G.worldShock *= 0.92;
  for (const C of alive(G)) {
    const M = lawMods(C);
    econStep(G, C, M);
    politicsStep(G, C, M);
    milStep(G, C);
    crisisCheck(G, C, M);
  }
  warsStep(G);
  aiStep(G);
  eventsStep(G);
  for (const C of alive(G)) recordHist(C);
  G.month++; if (G.month > 11) { G.month = 0; G.year++; }
  const P = G.countries[G.player];
  if (G.year >= END_YEAR && !G.gameOver) G.gameOver = { reason: 'end', text: `Ваш срок истории подошёл к концу: наступил ${END_YEAR} год.`, win: true };
  if (G.gameOver) G.gameOver.score = score(G, P);
}

function recordHist(C) {
  const h = C.hist, e = C.eco;
  const push = (k, v) => { h[k].push(Math.round(v * 1000) / 1000); if (h[k].length > 400) h[k].shift(); };
  push('gdp', e.gdp); push('gdppc', e.gdp / C.pop); push('infl', e.infl); push('unemp', e.unemp);
  push('approval', C.pol.approval); push('debt', e.debt / e.gdp); push('stability', C.pol.stability);
  push('deficit', e.budget.deficitGdp || 0); push('rate', e.rate);
}

function crisisCheck(G, C, M) {
  const pol = C.pol, e = C.eco;
  // переворот
  const sil = pol.groups.siloviki ?? 50;
  if (sil < 22 && C.gov !== 'democracy' && chance(0.02 + (22 - sil) / 400 - e.spend.security)) {
    if (!C.ai) { G.gameOver = { reason: 'coup', text: 'Военные свергли ваше правительство. Хунта берёт власть.' }; return; }
    regimeChange(G, C, 'nat', 'autocracy', 'военный переворот');
  }
  // революция
  if (pol.lowStab > 6 && chance(0.05 + (22 - pol.stability) / 200 - M.stability / 300)) {
    if (!C.ai) { G.gameOver = { reason: 'revolution', text: 'Массовые протесты переросли в революцию. Правительство пало.' }; return; }
    const np = C.gov === 'democracy' ? 'nat' : 'lib';
    regimeChange(G, C, np, C.gov === 'democracy' ? 'hybrid' : 'democracy', 'революция');
  }
  // дефолт ИИ
  if (C.ai && e.debt / e.gdp > 1.6 && e.debtRate > 0.1) {
    e.debt *= 0.6; e.conf -= 20; e.shock -= 0.05; e.fxPush = 0.5; e.debtRate *= 0.7;
    log(G, `${C.short} объявляет дефолт и реструктуризирует долг.`, 'world', C.id);
  }
}

export function regimeChange(G, C, party, gov, why) {
  C.party = party; C.gov = gov;
  C.pol.laws = C.pol.laws.filter((l) => !LAW_BY_ID[l].regime);
  C.pol.laws.push('reg_' + gov);
  C.pol.coalition = [party]; C.pol.stability = 45; C.pol.lowStab = 0; C.pol.termMonths = 0;
  C.pol.seats = allocateSeats(C, C.pol.support, true);
  C.pol.nextElection = GOV[gov].electionEvery;
  for (const g in C.pol.groups) C.pol.groups[g] = 50;
  for (const D of alive(G)) if (D.id !== C.id) G.rel[C.id][D.id] = G.rel[D.id][C.id] = clamp(Math.round((G.rel[C.id][D.id] + baseRel(G, C, D)) / 2), -100, 100);
  log(G, `${C.short}: ${why}! К власти приходит «${PARTIES[party].name}», режим — ${GOV[gov].name.toLowerCase()}.`, 'world', C.id);
}
function baseRel(G, A, B) {
  let v = 0; if (A.gov === B.gov) v += 10;
  v += 10 - 8 * ideoDist(A.party, B.party);
  return v;
}

export function score(G, C) {
  const e = C.eco;
  const pcG = (e.gdp / C.pop) / e.gdppc0;
  const terr = G.provs.filter((p) => p.land && p.owner === C.id).length;
  return Math.round(pcG * 400 + C.pol.approval * 3 + C.pol.stability * 2 + terr * 5 + G.turn * 0.8 - Math.max(0, e.debt / e.gdp - 0.6) * 200);
}

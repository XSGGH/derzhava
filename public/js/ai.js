// ===== Искусственный интеллект стран =====
import { alive, atWar, hasTreaty, sanctioned, borders, declareWar, wars, log, makePeace } from './sim.js';
import { relationsDrift, aiAccepts, sideStr } from './diplo.js';
import { pairKey } from './world.js';
import { chance, clamp, pick, rnd } from './rng.js';

export function aiStep(G) {
  relationsDrift(G);
  for (const C of alive(G)) {
    if (!C.ai) continue;
    aiFiscal(G, C);
    if (chance(0.12)) aiDiplomacy(G, C);
  }
  // ИИ предлагает игроку мир, если проигрывает
  for (const w of wars(G, G.player)) {
    const enemyLead = w.sideA.includes(G.player) ? w.b : w.a;
    if (G.countries[enemyLead].ai && w.months > 4 && chance(0.06) && !G.pendingEvents.some((e) => e.id === 'peace_offer')) {
      const eScore = w.sideA.includes(enemyLead) ? w.score : -w.score;
      if (eScore < -20 || G.countries[enemyLead].pol.warWeariness > 35) G.pendingEvents.push({ id: 'peace_offer', from: enemyLead });
    }
  }
}

function aiFiscal(G, C) {
  const e = C.eco, b = e.budget; if (!b || b.deficitGdp == null) return;
  const dg = e.debt / e.gdp;
  const tgtDef = dg > 0.9 ? 0.01 : dg > 0.6 ? 0.025 : 0.035;
  if (b.deficitGdp > tgtDef + 0.01) {
    if (e.tax.vat < 0.24) e.tax.vat += 0.0015; else if (e.tax.inc < 0.35) e.tax.inc += 0.0015;
    e.spend.social *= 0.997; e.spend.infra *= 0.997;
  } else if (b.deficitGdp < tgtDef - 0.015) {
    const k = b.deficitGdp < -0.03 ? 3 : 1;
    if (e.tax.vat > 0.08) e.tax.vat -= 0.0015 * k; else if (e.tax.inc > 0.08) e.tax.inc -= 0.001 * k; else if (e.tax.res > 0.2) e.tax.res -= 0.002 * k;
    e.spend.edu = Math.min(0.06, e.spend.edu * (1 + 0.002 * k)); e.spend.infra = Math.min(0.06, e.spend.infra * (1 + 0.003 * k));
    e.spend.social = Math.min(0.22, e.spend.social * (1 + 0.002 * k)); e.spend.health = Math.min(0.08, e.spend.health * (1 + 0.002 * k));
  }
  // выход из дефляционной ловушки
  e.printing = e.infl < 0 && e.rate < 0.005 ? Math.min(0.03, e.printing + 0.002) : Math.max(0, e.printing - 0.002);
  // военное время
  const ws = wars(G, C.id).length;
  const defT = ws ? 0.06 : C.aggr > 0.5 ? 0.04 : 0.02 + C.aggr * 0.02;
  e.spend.defense += (defT - e.spend.defense) * 0.02;
  C.mil.mobilized = ws > 0 && C.aggr > 0.3;
}

function aiDiplomacy(G, C) {
  const others = alive(G).filter((X) => X.id !== C.id);
  const X = pick(others); if (!X) return;
  const rel = G.rel[C.id][X.id];
  const toPlayer = X.id === G.player;
  const propose = (act) => {
    if (toPlayer) {
      if (!G.pendingEvents.some((e) => e.id === 'proposal' && e.from === C.id)) G.pendingEvents.push({ id: 'proposal', from: C.id, act });
    } else if (aiAccepts(G, C.id, X.id, act)) {
      const pk = pairKey(C.id, X.id);
      if (act === 'trade') G.treaties.trade[pk] = true;
      if (act === 'nap') G.treaties.nap[pk] = true;
      if (act === 'alliance') G.treaties.alliance[pk] = true;
      log(G, `${C.short} и ${X.short}: ${{ trade: 'торговое соглашение', nap: 'пакт о ненападении', alliance: 'военный союз' }[act]}.`, 'diplo');
    }
  };
  if (atWar(G, C.id, X.id)) return;
  if (rel >= 30 && !hasTreaty(G, 'trade', C.id, X.id) && !sanctioned(G, C.id, X.id) && !sanctioned(G, X.id, C.id)) return propose('trade');
  if (rel >= 65 && !hasTreaty(G, 'alliance', C.id, X.id) && (C.bloc === X.bloc || C.bloc === 'none' || X.bloc === 'none') && chance(0.3)) return propose('alliance');
  if (rel >= 10 && rel < 40 && borders(G, C.id, X.id) && !hasTreaty(G, 'nap', C.id, X.id) && chance(0.3)) return propose('nap');
  if (rel <= -45 && !sanctioned(G, C.id, X.id) && chance(0.35)) {
    G.sanctions[C.id + '>' + X.id] = true;
    G.rel[C.id][X.id] = clamp(rel - 20, -100, 100); G.rel[X.id][C.id] = clamp(G.rel[X.id][C.id] - 20, -100, 100);
    log(G, `${C.short} вводит санкции против ${X.short}.`, toPlayer ? 'bad' : 'diplo');
    return;
  }
  if (sanctioned(G, C.id, X.id) && rel > -15 && chance(0.4)) { delete G.sanctions[C.id + '>' + X.id]; log(G, `${C.short} снимает санкции с ${X.short}.`, 'diplo'); return; }
  if (rel > 15 && rel < 70 && chance(0.4)) { G.rel[C.id][X.id] += 3; G.rel[X.id][C.id] += 3; }
  // агрессия
  if (G.turn > 18 && C.aggr > 0.35 && rel < -35 && borders(G, C.id, X.id) && !hasTreaty(G, 'nap', C.id, X.id)
    && !hasTreaty(G, 'alliance', C.id, X.id) && !wars(G, C.id).length && C.pol.stability > 35) {
    const ratio = sideStr(G, C.id) / sideStr(G, X.id);
    const diff = G.difficulty === 'hard' ? 1.25 : G.difficulty === 'easy' ? 0.6 : 1;
    if (ratio > 1.5 && chance(C.aggr * 0.25 * diff * (toPlayer ? 1 : 0.6))) {
      declareWar(G, C.id, X.id);
      if (toPlayer) G.pendingEvents.push({ id: 'war_declared', from: C.id });
    }
  }
}

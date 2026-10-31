// ===== Дипломатия: действия игрока и решения ИИ =====
import { BLOCS } from './data.js';
import { pairKey, baseRelation } from './world.js';
import { atWar, hasTreaty, sanctioned, borders, declareWar, makePeace, strength, log, alive, wars } from './sim.js';
import { clamp } from './rng.js';

const relAdd = (G, a, b, v) => { G.rel[a][b] = clamp(G.rel[a][b] + v, -100, 100); G.rel[b][a] = clamp(G.rel[b][a] + v, -100, 100); };
export const sideStr = (G, id) => strength(G, G.countries[id]) + alive(G).filter((X) => X.id !== id && hasTreaty(G, 'alliance', X.id, id)).reduce((s, X) => s + strength(G, X) * 0.55, 0);

export const ACTIONS = {
  visit: { name: 'Дипломатический визит', pc: 5, desc: '+8 к отношениям. Раз в полгода на страну.' },
  aid: { name: 'Финансовая помощь', pc: 3, desc: 'Передать 0,3% своего ВВП. +15 к отношениям.' },
  trade: { name: 'Торговое соглашение', pc: 10, desc: 'Снижение барьеров: торговля +30%. Нужны отношения ≥ 20.' },
  cancel_trade: { name: 'Расторгнуть торговое соглашение', pc: 2, desc: '−15 к отношениям.' },
  nap: { name: 'Пакт о ненападении', pc: 8, desc: 'Обе стороны обязуются не нападать. Нужны отношения ≥ 0.' },
  alliance: { name: 'Военный союз', pc: 15, desc: 'Союзник вступает в оборонительные войны. Нужны отношения ≥ 55.' },
  break_alliance: { name: 'Выйти из союза', pc: 5, desc: '−30 к отношениям.' },
  sanction: { name: 'Ввести санкции', pc: 6, desc: 'Торговля падает на ~90% (остаток — серые схемы), их экспорт дешевеет. Бьёт и по вам.' },
  lift_sanction: { name: 'Снять санкции', pc: 2, desc: '+10 к отношениям.' },
  embargo: { name: 'Полное торговое эмбарго', pc: 10, desc: 'Торговля прекращается полностью, даже серые схемы. Сильный удар по обеим экономикам.' },
  lift_embargo: { name: 'Снять эмбарго', pc: 3, desc: '+10 к отношениям.' },
  war: { name: 'Объявить войну', pc: 25, desc: 'Нужна общая граница. Мир осудит агрессора.' },
  peace_white: { name: 'Предложить мир (статус-кво)', pc: 5, desc: 'Все оккупированные земли возвращаются.' },
  peace_annex: { name: 'Потребовать аннексии', pc: 10, desc: 'Оккупированные вами провинции отходят вам.' },
};

export function canDo(G, a, b, act) {
  const A = G.countries[a], B = G.countries[b];
  if (!B.alive) return { ok: false, why: 'Страна не существует' };
  const war = atWar(G, a, b), rel = G.rel[a][b];
  const pc = ACTIONS[act].pc;
  const need = (c, why) => (c ? null : why);
  const why = (() => {
    switch (act) {
      case 'visit': return need(!war, 'Идёт война') || need(!(G.cooldowns[a + 'visit' + b] > G.turn), 'Визит уже был недавно');
      case 'aid': return need(!war, 'Идёт война');
      case 'trade': return need(!war, 'Идёт война') || need(!hasTreaty(G, 'trade', a, b), 'Уже есть') || need(!sanctioned(G, a, b) && !sanctioned(G, b, a), 'Действуют санкции') || need(rel >= 20, 'Отношения ниже 20');
      case 'cancel_trade': return need(hasTreaty(G, 'trade', a, b), 'Нет соглашения');
      case 'nap': return need(!war, 'Идёт война') || need(!hasTreaty(G, 'nap', a, b), 'Уже есть') || need(rel >= 0, 'Отношения ниже 0');
      case 'alliance': return need(!war, 'Идёт война') || need(!hasTreaty(G, 'alliance', a, b), 'Уже союзники') || need(rel >= 55, 'Отношения ниже 55');
      case 'break_alliance': return need(hasTreaty(G, 'alliance', a, b), 'Нет союза');
      case 'sanction': return need(!sanctioned(G, a, b), 'Санкции уже действуют');
      case 'lift_sanction': return need(sanctioned(G, a, b), 'Санкций нет');
      case 'embargo': return need(!G.embargo?.[a + '>' + b], 'Уже действует') || need(!war, 'Идёт война');
      case 'lift_embargo': return need(!!G.embargo?.[a + '>' + b], 'Нет эмбарго');
      case 'war': return need(!war, 'Уже воюем') || need(borders(G, a, b), 'Нет общей границы') || need(!hasTreaty(G, 'alliance', a, b), 'Сначала выйдите из союза') || need(G.turn >= 3, 'Слишком рано');
      case 'peace_white': case 'peace_annex': return need(!!war && (war.a === a || war.b === a) && (war.a === b || war.b === b), 'Мир заключают лидеры коалиций');
    }
    return null;
  })();
  if (why) return { ok: false, why };
  if (A.pol.pc < pc) return { ok: false, why: `Нужно ${pc} политкапитала` };
  return { ok: true };
}

// согласится ли ИИ (b) на предложение от a
export function aiAccepts(G, a, b, act) {
  const A = G.countries[a], B = G.countries[b], rel = G.rel[b][a];
  const rival = A.bloc !== 'none' && B.bloc !== 'none' && A.bloc !== B.bloc;
  switch (act) {
    case 'trade': return rel >= 20 && (!rival || rel >= 45);
    case 'nap': return rel >= 5 || sideStr(G, a) > 1.5 * sideStr(G, b);
    case 'alliance': return rel >= 55 && !rival && !wars(G, a).length;
    case 'peace_white': {
      const w = atWar(G, a, b); const bScore = w.sideA.includes(b) ? w.score : -w.score;
      return bScore < -12 || B.pol.warWeariness > 30 || (w.months > 15 && bScore < 25);
    }
    case 'peace_annex': {
      const w = atWar(G, a, b); const bScore = w.sideA.includes(b) ? w.score : -w.score;
      return bScore < -45 || (bScore < -25 && B.pol.warWeariness > 40);
    }
  }
  return true;
}

export function doAction(G, a, b, act) {
  const c = canDo(G, a, b, act); if (!c.ok) return { ok: false, msg: c.why };
  const A = G.countries[a], B = G.countries[b];
  const pk = pairKey(a, b);
  const accepted = B.ai ? aiAccepts(G, a, b, act) : true;
  A.pol.pc -= ACTIONS[act].pc;
  if (!accepted) { relAdd(G, a, b, -2); return { ok: false, msg: `${B.short} отклоняет предложение.` }; }
  switch (act) {
    case 'visit': relAdd(G, a, b, 8); G.cooldowns[a + 'visit' + b] = G.turn + 6; break;
    case 'aid': { const amt = A.eco.gdp * 0.003; A.eco.debt += amt; B.eco.debt -= amt; relAdd(G, a, b, 15); break; }
    case 'trade': G.treaties.trade[pk] = true; relAdd(G, a, b, 8); break;
    case 'cancel_trade': delete G.treaties.trade[pk]; relAdd(G, a, b, -15); break;
    case 'nap': G.treaties.nap[pk] = true; relAdd(G, a, b, 5); break;
    case 'alliance': G.treaties.alliance[pk] = true; relAdd(G, a, b, 10); break;
    case 'break_alliance': delete G.treaties.alliance[pk]; relAdd(G, a, b, -30); break;
    case 'sanction': G.sanctions[a + '>' + b] = true; relAdd(G, a, b, -30);
      for (const X of alive(G)) if (X.id !== a && X.id !== b && hasTreaty(G, 'alliance', X.id, b)) relAdd(G, a, X.id, -8);
      break;
    case 'lift_sanction': delete G.sanctions[a + '>' + b]; relAdd(G, a, b, 10); break;
    case 'embargo': (G.embargo ||= {})[a + '>' + b] = true; G.sanctions[a + '>' + b] = true; delete G.treaties.trade[pk]; relAdd(G, a, b, -40); break;
    case 'lift_embargo': delete G.embargo[a + '>' + b]; relAdd(G, a, b, 10); break;
    case 'war': {
      if (hasTreaty(G, 'nap', a, b)) { for (const X of alive(G)) if (X.id !== a) relAdd(G, a, X.id, -15); log(G, `${A.short} вероломно нарушает пакт о ненападении!`, 'war'); }
      declareWar(G, a, b);
      if (!A.ai) { A.pol.gmods.push({ g: 'siloviki', v: 10, m: 12 }, { g: 'intel', v: -10, m: 12 }, { g: 'youth', v: -6, m: 12 }); }
      break;
    }
    case 'peace_white': makePeace(G, atWar(G, a, b), 'white'); break;
    case 'peace_annex': { const w = atWar(G, a, b); makePeace(G, w, w.sideA.includes(a) ? 'annexA' : 'annexB'); break; }
  }
  const msg = { visit: 'Визит прошёл успешно', aid: 'Помощь передана', trade: 'Торговое соглашение подписано', nap: 'Пакт подписан', alliance: 'Союз заключён', sanction: 'Санкции введены', lift_sanction: 'Санкции сняты', embargo: 'Эмбарго введено', lift_embargo: 'Эмбарго снято', war: 'Война объявлена', peace_white: 'Мир заключён', peace_annex: 'Противник капитулировал' }[act] || 'Готово';
  if (!['visit', 'aid'].includes(act)) log(G, `${A.short} → ${B.short}: ${msg.toLowerCase()}.`, act === 'war' ? 'war' : 'diplo');
  return { ok: true, msg };
}

export function joinBloc(G, id, bloc) {
  const C = G.countries[id];
  const members = alive(G).filter((X) => X.bloc === bloc && X.id !== id);
  const avg = members.length ? members.reduce((s, X) => s + G.rel[X.id][id], 0) / members.length : 100;
  if (bloc !== 'none' && avg < 35) return { ok: false, msg: `Средние отношения с членами блока ${Math.round(avg)} (нужно ≥ 35)` };
  if (C.pol.pc < 20) return { ok: false, msg: 'Нужно 20 политкапитала' };
  C.pol.pc -= 20;
  const old = C.bloc; C.bloc = bloc;
  for (const X of alive(G)) {
    if (X.id === id) continue;
    if (X.bloc === old && old !== 'none') { relAdd(G, id, X.id, -15); delete G.treaties.alliance[pairKey(id, X.id)]; }
    if (X.bloc === bloc && bloc !== 'none') { relAdd(G, id, X.id, 15); G.treaties.trade[pairKey(id, X.id)] = true; }
    else if (bloc !== 'none' && X.bloc !== 'none') relAdd(G, id, X.id, -15);
  }
  log(G, bloc === 'none' ? `${C.short} выходит из блока «${BLOCS[old].name}».` : `${C.short} вступает в «${BLOCS[bloc].name}».`, 'diplo');
  return { ok: true, msg: 'Готово' };
}

// дрейф отношений к «естественному» уровню
export function relationsDrift(G) {
  const L = alive(G);
  for (const A of L) for (const B of L) {
    if (A.id >= B.id) continue;
    if (atWar(G, A.id, B.id)) { G.rel[A.id][B.id] = G.rel[B.id][A.id] = -100; continue; }
    let t = baseRelation(G, A.id, B.id);
    if (hasTreaty(G, 'trade', A.id, B.id)) t += 12;
    if (hasTreaty(G, 'alliance', A.id, B.id)) t += 20;
    if (hasTreaty(G, 'nap', A.id, B.id)) t += 5;
    if (sanctioned(G, A.id, B.id) || sanctioned(G, B.id, A.id)) t -= 25;
    if (G.embargo?.[A.id + '>' + B.id] || G.embargo?.[B.id + '>' + A.id]) t -= 15;
    const lostA = G.provs.some((p) => p.land && p.core === A.id && p.owner === B.id);
    const lostB = G.provs.some((p) => p.land && p.core === B.id && p.owner === A.id);
    if (lostA || lostB) t -= 35;
    if (borders(G, A.id, B.id) && Math.max(A.aggr, B.aggr) > 0.5) t -= 6;
    for (const [x, y] of [[A.id, B.id], [B.id, A.id]]) G.rel[x][y] = clamp(G.rel[x][y] + (t - G.rel[x][y]) * 0.02, -100, 100);
  }
}

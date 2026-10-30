// ===== События: случайные, глобальные, дипломатические предложения =====
import { addGroupMod, log, alive, makePeace, atWar, lawMods } from './sim.js';
import { aiAccepts } from './diplo.js';
import { pairKey } from './world.js';
import { chance, pick, rr, clamp, rnd } from './rng.js';
import { PARTIES } from './data.js';

const gm = (C, g, v, m = 12) => addGroupMod(C, g, v, m);
const pctGdp = (C, x) => { C.eco.debt += C.eco.gdp * x; };

export const EVENTS = {
  // ---------- дипломатия ----------
  proposal: {
    title: (G, C, ev) => `Предложение от ${G.countries[ev.from].short}`,
    text: (G, C, ev) => `${G.countries[ev.from].name} предлагает заключить ${{ trade: 'торговое соглашение', nap: 'пакт о ненападении', alliance: 'военный союз' }[ev.act]}.`,
    choices: [
      { t: 'Принять', eff: (G, C, ev) => { G.treaties[ev.act][pairKey(C.id, ev.from)] = true; G.rel[C.id][ev.from] += 5; G.rel[ev.from][C.id] += 5; log(G, `Подписан договор с ${G.countries[ev.from].short}.`, 'diplo'); } },
      { t: 'Отклонить', eff: (G, C, ev) => { G.rel[ev.from][C.id] -= 5; } },
    ],
  },
  peace_offer: {
    title: (G, C, ev) => `${G.countries[ev.from].short} просит мира`,
    text: (G, C, ev) => `Противник устал от войны и предлагает мир на условиях статус-кво. Можно потребовать больше через дипломатию.`,
    choices: [
      { t: 'Заключить мир', eff: (G, C, ev) => { const w = atWar(G, C.id, ev.from); if (w) makePeace(G, w, 'white'); } },
      { t: 'Продолжить войну', eff: (G, C) => { gm(C, 'siloviki', 4, 6); gm(C, 'youth', -4, 6); } },
    ],
  },
  war_declared: {
    title: (G, C, ev) => `${G.countries[ev.from].short} объявила нам войну!`,
    text: (G, C, ev) => `Войска ${G.countries[ev.from].name} пересекли границу. Нация ждёт решений.`,
    choices: [
      { t: 'Всеобщая мобилизация', hint: 'Армия ×1,4, экономика страдает', eff: (G, C) => { C.mil.mobilized = true; gm(C, 'siloviki', 10); gm(C, 'workers', -5); C.pol.stability += 5; } },
      { t: 'Обратиться к нации', hint: 'Сплочение вокруг флага', eff: (G, C) => { for (const g of ['workers', 'pensioners', 'farmers', 'siloviki']) gm(C, g, 8, 8); } },
    ],
  },
  // ---------- внутренние ----------
  drought: {
    title: () => 'Засуха', p: 0.012, cond: (G, C) => C.eco.P.agri / C.eco.gdp > 0.04,
    text: () => 'Аномальная жара уничтожила часть урожая. Цены на продовольствие растут.',
    choices: [
      { t: 'Закупить зерно за рубежом (0,4% ВВП)', eff: (G, C) => { pctGdp(C, 0.004); C.eco.P.agri *= 0.94; } },
      { t: 'Выплатить компенсации фермерам (0,3% ВВП)', eff: (G, C) => { pctGdp(C, 0.003); C.eco.P.agri *= 0.9; C.eco.infl += 0.01; gm(C, 'farmers', 8); } },
      { t: 'Ничего не делать', eff: (G, C) => { C.eco.P.agri *= 0.88; C.eco.infl += 0.02; gm(C, 'farmers', -12); gm(C, 'pensioners', -5); } },
    ],
  },
  oil_found: {
    title: () => 'Открыто месторождение', p: 0.006, cond: () => true,
    text: (G, C, ev) => `Геологи нашли крупное месторождение ${ev.kind === 'oil' ? 'нефти' : ev.kind === 'gas' ? 'газа' : 'руд'}.`,
    init: (G, C, ev) => { ev.kind = pick(['oil', 'gas', 'metals']); },
    choices: [
      { t: 'Государственная разработка (0,5% ВВП)', eff: (G, C, ev) => { addRes(G, C, ev.kind, 1.4); pctGdp(C, 0.005); } },
      { t: 'Концессия иностранцам', hint: 'Бесплатно, но меньше выгоды', eff: (G, C, ev) => { addRes(G, C, ev.kind, 0.9); gm(C, 'business', 5); gm(C, 'siloviki', -4); } },
    ],
  },
  strike: {
    title: () => 'Всеобщая забастовка', p: 0.03, cond: (G, C) => (C.pol.groups.workers ?? 50) < 38,
    text: () => 'Профсоюзы вывели на улицы сотни тысяч человек. Заводы стоят.',
    choices: [
      { t: 'Уступить: повысить зарплаты бюджетникам (+1% соцрасходов)', eff: (G, C) => { C.eco.spend.social += 0.01; gm(C, 'workers', 12, 18); gm(C, 'business', -4); } },
      { t: 'Переговоры (15 ПК)', eff: (G, C) => { C.pol.pc -= 15; gm(C, 'workers', 6, 12); C.eco.shock -= 0.005; } },
      { t: 'Разогнать', eff: (G, C) => { gm(C, 'workers', -12, 18); gm(C, 'intel', -6); gm(C, 'siloviki', 4); C.eco.shock -= 0.01; C.pol.stability -= 4; } },
    ],
  },
  scandal: {
    title: () => 'Коррупционный скандал', p: 0.02, cond: (G, C) => C.soc.corruption > 35,
    text: (G, C) => `Журналисты опубликовали расследование о дворцах министра. ${C.soc.freedom > 50 ? 'Скандал на всех каналах.' : 'Материал расходится по соцсетям.'}`,
    choices: [
      { t: 'Отправить министра в отставку (10 ПК)', eff: (G, C) => { C.pol.pc -= 10; C.soc.corruption -= 2; gm(C, 'intel', 5); } },
      { t: 'Замять дело', eff: (G, C) => { gm(C, 'intel', -10); gm(C, 'youth', -6); C.soc.corruption += 2; C.pol.stability -= C.soc.freedom > 50 ? 6 : 2; } },
      { t: 'Объявить журналистов иноагентами', eff: (G, C) => { gm(C, 'intel', -14); gm(C, 'siloviki', 5); C.soc.freedom -= 5; } },
    ],
  },
  protests: {
    title: () => 'Массовые протесты', p: 0.08, cond: (G, C) => C.pol.stability < 35,
    text: () => 'Площади столицы заполнены протестующими. Требуют отставки правительства.',
    choices: [
      { t: 'Диалог и уступки (20 ПК)', eff: (G, C) => { C.pol.pc -= 20; C.pol.stability += 8; for (const g of ['intel', 'youth', 'workers']) gm(C, g, 6); } },
      { t: 'Силовой разгон', hint: 'Нужна лояльность силовиков', eff: (G, C) => { if ((C.pol.groups.siloviki ?? 50) > 40) { C.pol.stability += 10; gm(C, 'intel', -15, 24); gm(C, 'youth', -15, 24); } else { C.pol.stability -= 10; log(G, 'Полиция отказалась разгонять протестующих!', 'bad'); } } },
      { t: 'Игнорировать', eff: (G, C) => { C.pol.stability -= 6; C.eco.shock -= 0.01; } },
    ],
  },
  tech_breakthrough: {
    title: () => 'Технологический прорыв', p: 0.012, cond: (G, C) => C.soc.science > 55,
    text: () => 'Национальная лаборатория создала технологию мирового уровня.',
    choices: [
      { t: 'Коммерциализировать', eff: (G, C) => { C.eco.P.tech *= 1.08; gm(C, 'business', 5); gm(C, 'intel', 5); } },
      { t: 'Засекретить для армии', eff: (G, C) => { C.mil.equip *= 1.15; gm(C, 'siloviki', 8); } },
    ],
  },
  investors: {
    title: () => 'Иностранные инвесторы', p: 0.015, cond: (G, C) => C.pol.stability > 55 && C.soc.corruption < 50,
    text: () => 'Международный концерн хочет построить завод, если вы дадите налоговые каникулы.',
    choices: [
      { t: 'Согласиться', eff: (G, C) => { C.eco.P.industry *= 1.03; C.eco.conf += 5; gm(C, 'workers', 4); } },
      { t: 'Потребовать локализацию', eff: (G, C) => { if (chance(0.5)) { C.eco.P.industry *= 1.04; C.eco.P.tech *= 1.03; log(G, 'Инвесторы согласились на локализацию.', 'good'); } else log(G, 'Инвесторы ушли к соседям.', 'bad'); } },
      { t: 'Отказать', eff: (G, C) => { gm(C, 'siloviki', 2); } },
    ],
  },
  debt_crisis: {
    title: () => 'Долговой кризис', p: 0.2, cond: (G, C) => C.eco.debt / C.eco.gdp > 1.2 && C.eco.debtRate > 0.08,
    text: (G, C) => `Ставки по госдолгу ${Math.round(C.eco.debtRate * 1000) / 10}%. Рынки не верят в вашу платёжеспособность.`,
    choices: [
      { t: 'Программа МВФ: жёсткая экономия', hint: 'Соцрасходы −20%, доверие рынков', eff: (G, C) => { C.eco.spend.social *= 0.8; C.eco.spend.infra *= 0.8; C.eco.debtRate *= 0.75; gm(C, 'pensioners', -15, 24); gm(C, 'workers', -10, 24); C.eco.shock -= 0.02; } },
      { t: 'Дефолт', hint: 'Долг −40%, курс рухнет', eff: (G, C) => { C.eco.debt *= 0.6; C.eco.fxPush = 0.8; C.eco.conf -= 25; C.eco.shock -= 0.05; C.eco.debtRate += 0.03; for (const D of alive(G)) if (D.id !== C.id) G.rel[D.id][C.id] -= 10; } },
      { t: 'Печатать деньги', hint: 'Эмиссия 5% ВВП/год', eff: (G, C) => { C.eco.printing = Math.max(C.eco.printing, 0.05); } },
    ],
  },
  refugees: {
    title: () => 'Волна беженцев', p: 0.04, cond: (G, C) => alive(G).some((X) => X.id !== C.id && G.wars.some((w) => w.sideA.includes(X.id) || w.sideB.includes(X.id))) && !G.wars.some((w) => w.sideA.includes(C.id) || w.sideB.includes(C.id)),
    text: () => 'Из зоны конфликта бегут сотни тысяч людей. Они просят убежища.',
    choices: [
      { t: 'Принять', eff: (G, C) => { C.pop *= 1.01; gm(C, 'workers', -5); gm(C, 'intel', 5); C.eco.unemp += 0.004; } },
      { t: 'Закрыть границу', eff: (G, C) => { gm(C, 'siloviki', 4); gm(C, 'intel', -4); } },
    ],
  },
  pension_fund: {
    title: () => 'Пенсионный фонд пуст', p: 0.02, cond: (G, C) => C.eco.budget.deficitGdp > 0.05,
    text: () => 'Дефицит пенсионного фонда достиг рекорда. Министерство финансов требует решений.',
    choices: [
      { t: 'Заморозить индексацию пенсий', eff: (G, C) => { C.eco.spend.social *= 0.95; gm(C, 'pensioners', -12, 18); } },
      { t: 'Покрыть из бюджета', eff: (G, C) => { pctGdp(C, 0.008); } },
    ],
  },
  coup_rumors: {
    title: () => 'Слухи о заговоре генералов', p: 0.06, cond: (G, C) => (C.pol.groups.siloviki ?? 50) < 32 && C.gov !== 'democracy',
    text: () => 'Спецслужбы докладывают: часть генералитета обсуждает «смену курса».',
    choices: [
      { t: 'Чистка армии', hint: 'Армия ослабнет', eff: (G, C) => { C.mil.equip *= 0.9; C.mil.morale *= 0.9; gm(C, 'siloviki', 8, 18); } },
      { t: 'Повысить довольствие (+0,5% ВВП на оборону)', eff: (G, C) => { C.eco.spend.defense += 0.005; gm(C, 'siloviki', 12, 12); } },
      { t: 'Не реагировать', eff: () => {} },
    ],
  },
  cyber: {
    title: (G, C, ev) => `Кибератака (след ведёт в ${G.countries[ev.from].short})`, p: 0.015,
    cond: (G, C) => alive(G).some((X) => X.id !== C.id && G.rel[X.id][C.id] < -40),
    init: (G, C, ev) => { ev.from = pick(alive(G).filter((X) => X.id !== C.id && G.rel[X.id][C.id] < -40)).id; },
    text: () => 'Хакеры обрушили банковскую систему на двое суток.',
    choices: [
      { t: 'Ответная атака', eff: (G, C, ev) => { G.countries[ev.from].eco.shock -= 0.01; G.rel[ev.from][C.id] -= 10; G.rel[C.id][ev.from] -= 10; C.eco.shock -= 0.005; } },
      { t: 'Укрепить киберзащиту (0,2% ВВП)', eff: (G, C) => { pctGdp(C, 0.002); C.eco.shock -= 0.003; } },
    ],
  },
  bumper_harvest: {
    title: () => 'Рекордный урожай', p: 0.012, cond: (G, C) => C.eco.P.agri / C.eco.gdp > 0.05,
    text: () => 'Погода благоприятствовала — урожай рекордный.',
    choices: [{ t: 'Отлично', eff: (G, C) => { C.eco.P.agri *= 1.05; gm(C, 'farmers', 6); C.eco.infl -= 0.005; } }],
  },
  brain_drain: {
    title: () => 'Утечка мозгов', p: 0.025, cond: (G, C) => (C.pol.groups.intel ?? 50) < 35 && C.soc.freedom < 45,
    text: () => 'Учёные и айтишники массово уезжают за рубеж.',
    choices: [
      { t: 'Гранты для возвращения (0,3% ВВП)', eff: (G, C) => { pctGdp(C, 0.003); gm(C, 'intel', 6); } },
      { t: 'Ограничить выезд', eff: (G, C) => { gm(C, 'intel', -10); gm(C, 'youth', -8); C.soc.freedom -= 4; } },
      { t: 'Пусть едут', eff: (G, C) => { C.eco.P.tech *= 0.95; C.soc.science -= 3; } },
    ],
  },
  // ---------- глобальные ----------
  world_recession: {
    global: true, title: () => 'Мировая рецессия', p: 0.004,
    text: () => 'Обвал на биржах Аурелии спровоцировал мировой кризис. Спрос падает везде.',
    apply: (G) => { G.worldShock -= 0.04; for (const k of ['oil', 'gas', 'metals']) G.markets[k].shock *= 0.75; },
    choices: [
      { t: 'Антикризисный пакет (2% ВВП)', eff: (G, C) => { pctGdp(C, 0.02); C.eco.shock += 0.025; } },
      { t: 'Бюджетная дисциплина', eff: (G, C) => { gm(C, 'business', 4); gm(C, 'workers', -6); } },
    ],
  },
  oil_shock: {
    global: true, title: () => 'Нефтяной шок', p: 0.005,
    text: () => 'Конфликт в проливах перекрыл танкерные маршруты. Нефть и газ резко дорожают.',
    apply: (G) => { G.markets.oil.shock *= 1.5; G.markets.gas.shock *= 1.4; },
    choices: [{ t: 'Понятно', eff: () => {} }, { t: 'Субсидировать топливо (0,5% ВВП)', eff: (G, C) => { pctGdp(C, 0.005); C.eco.infl -= 0.01; gm(C, 'workers', 4); } }],
  },
  pandemic: {
    global: true, title: () => 'Пандемия', p: 0.0025,
    text: () => 'Новый вирус распространяется по миру. Больницы переполнены.',
    apply: (G) => { G.worldShock -= 0.03; for (const X of alive(G)) X.pop *= 1 - 0.002 * (1 - X.soc.health / 100); },
    choices: [
      { t: 'Жёсткий карантин', hint: 'Экономика −, здоровье +', eff: (G, C) => { C.eco.shock -= 0.03; gm(C, 'pensioners', 6); gm(C, 'youth', -8); gm(C, 'business', -8); } },
      { t: 'Мягкие меры', eff: (G, C) => { C.pop *= 0.998; gm(C, 'pensioners', -10); } },
    ],
  },
  grain_crisis: {
    global: true, title: () => 'Мировой продовольственный кризис', p: 0.004,
    text: () => 'Неурожай в нескольких регионах мира: цены на зерно взлетели.',
    apply: (G) => { G.markets.grain.shock *= 1.5; },
    choices: [{ t: 'Понятно', eff: () => {} }, { t: 'Запретить экспорт зерна', eff: (G, C) => { C.eco.infl -= 0.01; gm(C, 'farmers', -8); } }],
  },
  tech_boom: {
    global: true, title: () => 'Технологический бум', p: 0.004,
    text: () => 'Прорыв в ИИ запускает волну инвестиций в технологические компании.',
    apply: (G) => { for (const X of alive(G)) X.eco.P.tech *= 1 + 0.06 * X.soc.science / 100; },
    choices: [{ t: 'Отлично', eff: () => {} }],
  },
};

function addRes(G, C, kind, amt) {
  const own = G.provs.filter((p) => p.land && p.owner === C.id);
  const p = pick(own); if (!p) return;
  p.res[kind] += amt;
  if (!C.eco.miningCap) C.eco.miningCap = C.eco.gdp * 0.01;
}

export function eventsStep(G) {
  const P = G.countries[G.player]; if (!P || !P.alive) return;
  // глобальные
  for (const [id, E] of Object.entries(EVENTS)) {
    if (!E.global || !chance(E.p)) continue;
    E.apply(G);
    log(G, E.title(G, P, {}), 'world');
    for (const X of alive(G)) if (X.ai && E.choices.length > 1 && chance(0.5)) E.choices[0].eff(G, X, {});
    G.pendingEvents.push({ id });
    break;
  }
  if (G.pendingEvents.length >= 2) return;
  // локальные
  const ids = Object.keys(EVENTS).filter((id) => EVENTS[id].p && !EVENTS[id].global);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  for (const id of ids) {
    const E = EVENTS[id];
    if ((G.cooldowns['ev' + id] || 0) > G.turn) continue;
    if (!E.cond(G, P) || !chance(E.p)) continue;
    const ev = { id }; E.init?.(G, P, ev);
    G.pendingEvents.push(ev); G.cooldowns['ev' + id] = G.turn + 12;
    break;
  }
  // события у ИИ (для живости мира)
  for (const X of alive(G)) {
    if (!X.ai) continue;
    if (chance(0.006)) { X.eco.shock -= 0.02; log(G, `${X.short}: ${pick(['землетрясение', 'наводнение', 'банковский кризис', 'забастовка шахтёров'])}.`, 'world', X.id); }
    if (chance(0.004)) { X.eco.P.tech *= 1.04; log(G, `${X.short}: технологический прорыв.`, 'world', X.id); }
  }
}

export function resolveEvent(G, ev, choiceIdx) {
  const E = EVENTS[ev.id]; const C = G.countries[G.player];
  const ch = E.choices[choiceIdx];
  ch.eff(G, C, ev);
  C.pol.pc = clamp(C.pol.pc, 0, 200);
  for (const X of alive(G)) for (const Y of alive(G)) if (X.id !== Y.id) G.rel[X.id][Y.id] = clamp(G.rel[X.id][Y.id], -100, 100);
  G.pendingEvents = G.pendingEvents.filter((e) => e !== ev);
  if (!E.global) log(G, `${E.title(G, C, ev)}: «${ch.t}»`, 'event');
}

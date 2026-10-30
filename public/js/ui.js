// ===== Интерфейс =====
import { COUNTRIES, PARTIES, GROUPS, GOV, BLOCS, LAWS, LAW_BY_ID, LAW_CATS, END_YEAR } from './data.js';
import { GOODS, GOOD, GOOD_CATS, IO, USED_IN } from './goods.js';
import { tariffOf } from './trade.js';
import { createWorld } from './world.js';
import {
  step, dateStr, budget, lawMods, lawVote, lawAvailable, passLaw, repealLaw, strength, wars, atWar, hasTreaty, sanctioned,
  groupTargets, addGroupMod, election, log, alive, score, borders,
} from './sim.js';
import { ACTIONS, canDo, doAction, joinBloc } from './diplo.js';
import { EVENTS, resolveEvent } from './events.js';
import { MapView } from './map.js';
import { lineChart, spark, hbars } from './charts.js';
import { seedRng, getRng } from './rng.js';

let G = null, map = null, timer = null, speed = 0, tab = 'overview', selC = null, lawCat = 'econ';
let tradeView = { v: 'list' }, tradeCat = 'all', tradeSort = { k: 'ex', d: -1 };
const $ = (s, r = document) => r.querySelector(s);
const P = () => G.countries[G.player];

// ---------- форматирование ----------
const nf = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const bn = (x) => (Math.abs(x) >= 1000 ? nf(x / 1000, 2) + ' трлн $' : nf(x, Math.abs(x) < 10 ? 1 : 0) + ' млрд $');
const pct = (x, d = 1) => nf(x * 100, d) + '%';
const spct = (x, d = 1) => (x > 0 ? '+' : '') + nf(x * 100, d) + '%';
const cls = (good) => (good ? 'good' : 'bad');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bar = (v, color) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${color || barColor(v)}"></i></div>`;
const barColor = (v) => (v < 30 ? '#e0473e' : v < 50 ? '#e8a33c' : v < 70 ? '#c9c34a' : '#3fbf6f');

const DESC = {
  borea: 'Огромная сырьевая держава севера. Нефть и газ кормят бюджет, но коррупция и санкционный риск тянут вниз.',
  valdia: 'Индустриальное сердце Запада. Богатая, стареющая демократия с сильными институтами и высокими налогами.',
  aurelia: 'Финансовый центр мира. Сфера услуг, большой госдолг и дефицит торгового баланса.',
  ostmark: 'Маленькая технологическая республика. Очень богата, но армия символическая, а сосед — Борея.',
  xandria: 'Многолюдная индустриальная автократия. Фабрика мира, стремящаяся к технологическому лидерству.',
  kargas: 'Нефтяной эмират в пустыне. Бюджет полностью зависит от цен на нефть.',
  zarakhan: 'Газовый султанат с амбициями региональной державы и неспокойными соседями.',
  mirena: 'Бедная аграрная демократия. Молодое население, слабые институты, огромный потенциал.',
  liorna: 'Страна «среднего пути» в центре континента. Диверсифицированная экономика, гибридный режим.',
  tarvania: 'Нищая, но богатая металлами диктатура. Хрупкая стабильность и агрессивная элита.',
};
const DIFF = { valdia: 'Лёгкая', aurelia: 'Средняя', ostmark: 'Средняя', borea: 'Средняя', xandria: 'Средняя', kargas: 'Средняя', zarakhan: 'Сложная', mirena: 'Сложная', liorna: 'Средняя', tarvania: 'Очень сложная' };

// ---------- старт ----------
export function boot() {
  const saved = localStorage.getItem('derzhava_save') || localStorage.getItem('derzhava_auto');
  $('#start').innerHTML = `
    <div class="start-wrap">
      <header class="hero">
        <div class="hero-mark">◆</div>
        <h1>ДЕРЖАВА</h1>
        <p class="tag">Геополитическая стратегия · ${COUNTRIES.length} государств · 2030–${END_YEAR}</p>
        <p class="lead">Управляйте бюджетом и ставкой, проводите реформы через парламент, балансируйте между элитами и улицей, торгуйте, вводите санкции и воюйте. Каждое решение — компромисс.</p>
      </header>
      <h2 class="pick">Выберите государство</h2>
      <div class="cards">${COUNTRIES.map((c) => `
        <button class="ccard" data-start="${c.id}" style="--cc:${c.color}">
          <div class="ccard-top"><span class="flag" style="background:${c.color}"></span><b>${c.name}</b></div>
          <p>${DESC[c.id]}</p>
          <div class="ccard-stats">
            <span>${GOV[c.gov].name}</span><span>${BLOCS[c.bloc].name}</span>
            <span>Население ${c.pop} млн</span><span>ВВП/душу ${c.gdppc} тыс. $</span>
            <span>Партия: ${PARTIES[c.party].short}</span><span class="diff">Сложность: ${DIFF[c.id]}</span>
          </div>
        </button>`).join('')}
      </div>
      <div class="start-opts">
        <label>Агрессивность ИИ <select id="diff"><option value="easy">Мирный мир</option><option value="normal" selected>Обычная</option><option value="hard">Жестокий мир</option></select></label>
        ${saved ? '<button class="btn" id="loadBtn">Продолжить сохранённую игру</button>' : ''}
      </div>
    </div>`;
  $('#start').onclick = (e) => {
    const b = e.target.closest('[data-start]');
    if (b) { G = createWorld(b.dataset.start, { difficulty: $('#diff').value }); initGame(); log(G, `Вы возглавили государство ${P().name}. Удачи!`, 'good'); renderAll(); }
  };
  $('#loadBtn')?.addEventListener('click', () => loadGame());
}

function loadGame(key) {
  const raw = localStorage.getItem(key || 'derzhava_save') || localStorage.getItem('derzhava_auto');
  if (!raw) return toast('Сохранений нет');
  G = JSON.parse(raw); seedRng(G.rngState || 1); G._borders = null;
  initGame(); renderAll(); toast('Игра загружена');
}
function saveGame(key = 'derzhava_save', quiet) {
  G.rngState = getRng();
  const { _borders, ...rest } = G;
  try { localStorage.setItem(key, JSON.stringify(rest)); if (!quiet) toast('Игра сохранена'); } catch (e) { toast('Не удалось сохранить: ' + e.message); }
}

function initGame() {
  $('#start').hidden = true; $('#game').hidden = false;
  map = new MapView($('#map'), onProvClick, onHover);
  map.build(G);
  $('#tabs').innerHTML = TABS.map(([id, n]) => `<button data-tab="${id}" class="${id === tab ? 'on' : ''}">${n}</button>`).join('');
  $('#tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; renderTab(); } };
  $('#modes').onclick = (e) => { const b = e.target.closest('[data-mode]'); if (b) { map.setMode(b.dataset.mode); for (const x of $('#modes').children) x.classList.toggle('on', x === b); } };
  $('#controls').onclick = (e) => {
    const b = e.target.closest('[data-ctl]'); if (!b) return;
    const c = b.dataset.ctl;
    if (c === 'next') nextTurn();
    else if (c === 'save') saveGame();
    else if (c === 'load') loadGame();
    else if (c === 'menu') { if (confirm('Выйти в главное меню? Несохранённый прогресс будет потерян.')) location.reload(); }
    else setSpeed(+c);
  };
  $('#panel').onclick = onPanelClick;
  $('#panel').oninput = onPanelInput;
  $('#panel').onchange = onPanelChange;
  document.onkeydown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); setSpeed(speed ? 0 : 1); }
    if (e.key === 'Enter') nextTurn();
  };
}

function setSpeed(s) {
  speed = s; clearInterval(timer); timer = null;
  if (s) timer = setInterval(() => { if (G.pendingEvents.length || G.gameOver) return setSpeed(0); nextTurn(); }, s === 1 ? 1400 : s === 2 ? 600 : 220);
  for (const b of document.querySelectorAll('[data-ctl]')) b.classList.toggle('on', b.dataset.ctl === String(s) && s > 0);
}

function nextTurn() {
  if (G.gameOver || G.pendingEvents.length) { showEvent(); return; }
  step(G);
  if (G.month === 0) saveGame('derzhava_auto', true);
  renderAll();
}

function renderAll() {
  renderHeader(); renderTab(); map.update();
  if (G.gameOver) return showGameOver();
  showEvent();
}

// ---------- шапка ----------
function renderHeader() {
  const C = P(), e = C.eco;
  const chip = (label, val, good, title = '') => `<div class="chip ${good === undefined ? '' : cls(good)}" title="${title}"><span>${label}</span><b>${val}</b></div>`;
  $('#hdr-country').innerHTML = `<span class="flag" style="background:${C.color}"></span><div><b>${C.short}</b><small>${GOV[C.gov].name} · ${PARTIES[C.party].short}</small></div>`;
  $('#hdr-date').textContent = dateStr(G);
  $('#hdr-stats').innerHTML = [
    chip('ВВП', bn(e.gdp), undefined, 'Валовой внутренний продукт в год'),
    chip('Рост', spct(e.growth), e.growth > 0.015, 'Рост ВВП год к году'),
    chip('Инфляция', pct(e.infl), e.infl < 0.06 && e.infl > -0.005),
    chip('Безраб.', pct(e.unemp), e.unemp < 0.07),
    chip('Долг', pct(e.debt / e.gdp, 0), e.debt / e.gdp < 0.8),
    chip('Одобрение', nf(C.pol.approval), C.pol.approval > 45),
    chip('Стабильность', nf(C.pol.stability), C.pol.stability > 40),
    chip('Политкапитал', nf(C.pol.pc), undefined, 'Тратится на законы, дипломатию и указы'),
  ].join('');
}

const TABS = [['overview', 'Обзор'], ['economy', 'Экономика'], ['trade', 'Торговля'], ['budget', 'Бюджет'], ['society', 'Общество'], ['politics', 'Политика'], ['laws', 'Законы'], ['diplomacy', 'Дипломатия'], ['military', 'Армия'], ['world', 'Мир']];

function renderTab() {
  for (const b of $('#tabs').children) b.classList.toggle('on', b.dataset.tab === tab);
  const fn = { overview, economy, budgetTab, society, politics, laws, diplomacy, military, world, trade: tradeTab }[tab === 'budget' ? 'budgetTab' : tab];
  const sc = $('#panel').scrollTop;
  $('#panel').innerHTML = fn();
  $('#panel').scrollTop = sc;
  afterRender();
  syncTradeMap();
}

// ---------- советники ----------
function advisors(C) {
  const e = C.eco, pol = C.pol, out = [];
  const add = (lvl, who, t) => out.push({ lvl, who, t });
  if (e.infl > 0.1) add('bad', 'Центробанк', `Инфляция ${pct(e.infl)}. ${e.autoRate || lawMods(C).rateRule ? 'Ставка растёт автоматически, но бюджетный дефицит и эмиссия разгоняют цены.' : 'Поднимите ключевую ставку или включите автопилот.'}`);
  if (e.printing > 0.01) add('bad', 'Минфин', `Эмиссия ${pct(e.printing)} ВВП в год — прямой путь к инфляции.`);
  if (e.infl < 0) add('warn', 'Центробанк', 'Дефляция: снижайте ставку и стимулируйте спрос.');
  if (e.unemp > 0.1) add('bad', 'Минтруд', `Безработица ${pct(e.unemp)}. Нужен стимул: снизить ставку, расширить расходы или провести реформу рынка труда.`);
  if (e.budget.deficitGdp > 0.05) add('warn', 'Минфин', `Дефицит бюджета ${pct(e.budget.deficitGdp)} ВВП. Долг будет расти, ставки по нему тоже.`);
  if (e.debt / e.gdp > 1.1) add('bad', 'Минфин', `Госдолг ${pct(e.debt / e.gdp, 0)} ВВП — риск долгового кризиса. Рейтинг: ${e.rating}.`);
  if (e.accessLoss > 0.1) add('warn', 'МИД', `Санкции и войны сократили доступ к рынкам на ${pct(e.accessLoss, 0)}.`);
  if (pol.stability < 35) add('bad', 'Спецслужбы', 'Стабильность критически низкая — возможны массовые протесты и революция.');
  if ((pol.groups.siloviki ?? 50) < 30 && C.gov !== 'democracy') add('bad', 'Спецслужбы', 'Силовики недовольны. Риск переворота!');
  const every = GOV[C.gov].electionEvery;
  if (every && pol.nextElection <= 12) {
    const s = pol.support[C.party];
    add(s > 0.3 ? 'info' : 'warn', 'Штаб партии', `Выборы через ${pol.nextElection} мес. Рейтинг партии ${pct(s, 0)}${s < 0.3 ? ' — нужно срочно поднимать популярность.' : '.'}`);
  }
  for (const w of wars(G, C.id)) {
    const my = w.sideA.includes(C.id) ? w.score : -w.score;
    add(my < 0 ? 'bad' : 'info', 'Генштаб', `Война с ${G.countries[w.sideA.includes(C.id) ? w.b : w.a].short}: ${my >= 0 ? 'перевес наш' : 'мы отступаем'} (${nf(my)}).`);
  }
  if (pol.pc > 120) add('info', 'Администрация', `Накоплено ${nf(pol.pc)} политкапитала — самое время для реформ.`);
  if (!out.length) add('good', 'Аппарат', 'Обстановка спокойная. Хорошее время для долгосрочных реформ.');
  return out;
}

// ---------- вкладки ----------
function overview() {
  const C = P();
  const ad = advisors(C).map((a) => `<div class="adv ${a.lvl}"><b>${a.who}</b>${a.t}</div>`).join('');
  const logs = G.log.slice(0, 60).map((l) => `<div class="log ${l.kind}"><span>${l.d}</span>${esc(l.text)}</div>`).join('');
  return `
  <section><h3>Доклады советников</h3>${ad}</section>
  <section class="grid2">
    <div class="card"><h4>ВВП, млрд $</h4><canvas data-chart="gdp"></canvas></div>
    <div class="card"><h4>Инфляция и безработица</h4><canvas data-chart="infl"></canvas></div>
    <div class="card"><h4>Одобрение и стабильность</h4><canvas data-chart="appr"></canvas></div>
    <div class="card"><h4>Госдолг и дефицит, % ВВП</h4><canvas data-chart="debt"></canvas></div>
  </section>
  <section><h3>Хроника</h3><div class="logs">${logs}</div></section>`;
}

function economy() {
  const C = P(), e = C.eco, M = lawMods(C);
  const manual = !(M.rateRule > 0) && !e.autoRate;
  const tot = e.P.agri + e.P.industry + e.P.services + e.P.tech + e.miningOut;
  const sectors = [['agri', 'Сельское хозяйство'], ['industry', 'Промышленность'], ['services', 'Услуги'], ['tech', 'Высокие технологии']];
  const util = { agri: C.trade.agriIdx, industry: C.trade.U.industry, services: C.trade.U.services, tech: C.trade.U.tech };
  const rows = sectors.map(([k, n]) => `<tr><td>${n}</td><td class="num">${bn(e.P[k])}</td><td class="num">${pct(e.P[k] / tot)}</td><td class="num ${cls(e.sectorG?.[k] > 0.015)}">${spct(e.sectorG?.[k] || 0)}</td><td class="num ${cls(util[k] > 0.97)}">${pct(util[k], 0)}</td></tr>`).join('')
    + `<tr><td>Добыча сырья</td><td class="num">${bn(e.miningOut)}</td><td class="num">${pct(e.miningOut / tot)}</td><td class="num">${spct(Math.log(e.miningEff) / Math.max(1, G.turn / 12))}</td><td class="num">по ценам</td></tr>`;
  const keyG = ['oil', 'gas', 'grain', 'steel', 'chips', 'cars'];
  const com = keyG.map((gid) => `<tr class="click" data-act="good_go" data-id="${gid}"><td>${GOOD[gid].icon} ${GOOD[gid].name}</td><td class="num">${priceStr(gid)}</td><td class="num ${chg12(gid) >= 0 ? 'up' : 'down'}">${spct(chg12(gid), 0)}</td><td>${spark(G.goods[gid].hist.slice(-60), 'auto')}</td></tr>`).join('');
  const T = C.trade;
  return `
  <section class="kpis">
    ${kpi('ВВП', bn(e.gdp), spct(e.growth) + ' г/г')}
    ${kpi('ВВП на душу', nf(e.gdp / C.pop * 1000) + ' $', 'старт: ' + nf(e.gdppc0 * 1000) + ' $')}
    ${kpi('Разрыв выпуска', spct(e.gap), e.gap > 0.02 ? 'перегрев' : e.gap < -0.02 ? 'спад' : 'норма')}
    ${kpi('Инвестиции', pct(e.investRate || 0.2), 'от ВВП')}
    ${kpi('Доверие бизнеса', nf(e.conf), '/100')}
    ${kpi('Неравенство (Джини)', nf(e.gini, 2), e.gini > 0.4 ? 'высокое' : 'умеренное')}
  </section>
  <section class="grid2">
    <div class="card"><h4>ВВП по отраслям, млрд $</h4><canvas data-chart="e_sect"></canvas></div>
    <div class="card"><h4>Рост ВВП год к году, %</h4><canvas data-chart="e_growth"></canvas></div>
    <div class="card"><h4>Ставка, инфляция и ожидания, %</h4><canvas data-chart="e_rate"></canvas></div>
    <div class="card"><h4>Курс валюты и цены товарной корзины</h4><canvas data-chart="e_fx"></canvas></div>
    <div class="card"><h4>Безработица, %</h4><canvas data-chart="e_unemp"></canvas></div>
    <div class="card"><h4>Доверие бизнеса</h4><canvas data-chart="e_conf"></canvas></div>
  </section>
  <section class="card"><h4>Отрасли</h4><table class="tbl"><tr><th>Сектор</th><th>Потенциал</th><th>Доля</th><th>Рост потенциала</th><th>Загрузка</th></tr>${rows}</table><div class="mini">Загрузка падает, если отрасли не хватает сырья (дефицит, санкции) или ей некуда продавать продукцию.</div></section>
  <section class="card">
    <h4>Денежная политика</h4>
    <div class="row"><label><input type="checkbox" data-k="autoRate" ${e.autoRate ? 'checked' : ''} ${M.rateRule > 0 ? 'disabled' : ''}> Автопилот ставки (правило Тейлора)</label>
    ${M.rateRule > 0 ? '<span class="pill">ЦБ независим — ставку определяет он</span>' : ''}</div>
    ${slider('rate', 'Ключевая ставка', e.rate, 0, 0.5, 0.0025, pct(e.rate, 2), !manual)}
    ${slider('printing', 'Денежная эмиссия на нужды бюджета', e.printing, 0, 0.1, 0.0025, pct(e.printing) + ' ВВП/год')}
    <div class="mini">Реальная ставка: <b>${pct(e.rate - e.inflExp)}</b> · Инфляционные ожидания: <b>${pct(e.inflExp)}</b> · Инфляция: <b>${pct(e.infl)}</b> · Естественная безработица: <b>${pct(e.nairu || 0.05)}</b></div>
  </section>
  <section class="card">
    <h4>Внешний сектор</h4>
    <div class="kv">
      <div><span>Курс валюты (индекс, 100 = 2030)</span><b>${nf(e.fx, 1)}</b></div>
      <div><span>Экспорт</span><b>${bn(e.ex)}</b></div>
      <div><span>Импорт</span><b>${bn(e.im)}</b></div>
      <div><span>Торговый баланс</span><b class="${cls(e.ex >= e.im)}">${bn(e.ex - e.im)} (${spct((e.ex - e.im) / e.gdp)})</b></div>
      <div><span>Золотовалютные резервы</span><b>${bn(e.reserves)}</b></div>
      <div><span>Потеря доступа к рынкам</span><b class="${cls(e.accessLoss < 0.05)}">${pct(e.accessLoss, 0)}</b></div>
      <div><span>Санкционное давление (доля мирового ВВП)</span><b class="${cls(e.sanctLoss < 0.05)}">${pct(e.sanctLoss || 0, 0)}</b></div>
    </div>
    <div class="row"><button class="btn ghost" data-act="tab_trade">Торговля по товарам и партнёрам →</button><button class="btn" data-act="fxint">Валютная интервенция (−3% ВВП резервов)</button><span class="mini">Укрепляет курс, сбивает инфляцию от девальвации.</span></div>
  </section>
  <section class="card"><h4>Ключевые рынки</h4><table class="tbl"><tr><th>Товар</th><th>Цена</th><th>12 мес</th><th>5 лет</th></tr>${com}</table><div class="row"><button class="btn" data-act="tab_trade">Все 25 товаров и торговые потоки →</button></div></section>`;
}

const kpi = (l, v, s) => `<div class="kpi"><span>${l}</span><b>${v}</b><small>${s}</small></div>`;
const slider = (k, label, v, min, max, st, shown, dis = false, hint = '') =>
  `<div class="sl ${dis ? 'dis' : ''}"><div class="sl-h"><span>${label}</span><b data-show="${k}">${shown}</b></div><input type="range" data-k="${k}" min="${min}" max="${max}" step="${st}" value="${v}" ${dis ? 'disabled' : ''}>${hint ? `<small>${hint}</small>` : ''}</div>`;

const TAXES = [['inc', 'НДФЛ', 0, 0.5, 'Рабочие и бизнес не любят высокий налог'], ['pay', 'Страховые взносы', 0, 0.5, 'Налог на фонд оплаты труда'], ['corp', 'Налог на прибыль', 0, 0.5, 'Сильно бьёт по инвестициям и бизнесу'],
  ['vat', 'НДС', 0, 0.3, 'Стабильный доход, давит на потребление'], ['res', 'НДПИ / рента', 0, 0.8, 'Доля государства в выручке добычи'], ['tariff', 'Импортные пошлины', 0, 0.4, 'Защищает рынок, но дороже импорт']];
const SPEND = [['social', 'Соцвыплаты и пенсии', 0.3], ['health', 'Здравоохранение', 0.12], ['edu', 'Образование', 0.1], ['infra', 'Инфраструктура', 0.1], ['defense', 'Оборона', 0.12],
  ['security', 'Полиция и безопасность', 0.06], ['science', 'Наука', 0.06], ['subAgri', 'Субсидии АПК', 0.04], ['subInd', 'Субсидии промышленности', 0.04], ['subTech', 'Субсидии IT и хай-теку', 0.04]];
const REV_N = { inc: 'НДФЛ', pay: 'Страховые взносы', corp: 'Налог на прибыль', vat: 'НДС', res: 'НДПИ / рента', tariff: 'Импортные пошлины', duty: 'Экспортные пошлины' };
const EXP_N = { social: 'Соцвыплаты', health: 'Здравоохранение', edu: 'Образование', infra: 'Инфраструктура', defense: 'Оборона', security: 'Безопасность', science: 'Наука', subsidies: 'Субсидии', admin: 'Госаппарат', programs: 'Госпрограммы', tradeSub: 'Субсидии товаропроизводителям', war: 'Военные операции', interest: 'Проценты по долгу' };

function budgetSummary(C) {
  const b = budget(G, C), e = C.eco;
  C.eco.budget = { ...C.eco.budget, ...b };
  const r = Object.entries(b.rev).map(([k, v]) => `<div><span>${REV_N[k]}</span><b>${bn(v)}</b></div>`).join('');
  const x = Object.entries(b.exp).filter(([, v]) => v > 0.01).map(([k, v]) => `<div><span>${EXP_N[k]}</span><b>${bn(v)}</b></div>`).join('');
  return `<div class="bsum">
    <div class="big ${cls(b.deficit <= 0.03 * e.gdp)}"><span>${b.deficit > 0 ? 'Дефицит' : 'Профицит'}</span><b>${bn(Math.abs(b.deficit))}</b><small>${pct(Math.abs(b.deficitGdp))} ВВП</small></div>
    <div class="big"><span>Доходы</span><b>${bn(b.R)}</b><small>${pct(b.revGdp)} ВВП · собираемость ${pct(b.compl, 0)}</small></div>
    <div class="big"><span>Расходы</span><b>${bn(b.X)}</b><small>${pct(b.X / e.gdp)} ВВП</small></div>
    <div class="big ${cls(e.debt / e.gdp < 0.8)}"><span>Госдолг</span><b>${pct(e.debt / e.gdp, 0)}</b><small>ставка ${pct(e.debtRate)} · рейтинг ${e.rating}</small></div>
  </div><div class="grid2"><div class="kv"><h5>Доходы</h5>${r}</div><div class="kv"><h5>Расходы</h5>${x}</div></div>`;
}

function budgetTab() {
  const C = P(), e = C.eco, M = lawMods(C);
  return `
  <section class="card" id="bsum">${budgetSummary(C)}</section>
  <section class="grid2"><div class="card"><h4>Доходы и расходы, млрд $</h4><canvas data-chart="b_revexp"></canvas></div><div class="card"><h4>Дефицит и долг, % ВВП</h4><canvas data-chart="debt"></canvas></div></section>
  <section class="card"><h4>Налоги</h4>${TAXES.map(([k, n, mi, ma, h]) => slider('tax.' + k, n, e.tax[k] || 0, mi, ma, 0.005, pct(e.tax[k] || 0, 1), false, h + (k === 'tariff' && M.tariffCap ? ` · свободная торговля: не выше ${pct(M.tariffCap, 0)}` : ''))).join('')}</section>
  <section class="card"><h4>Расходы, % ВВП</h4>${SPEND.map(([k, n, ma]) => slider('spend.' + k, n, e.spend[k], 0, ma, 0.001, pct(e.spend[k], 1) + ' · ' + bn(e.spend[k] * e.gdp))).join('')}
  <div class="mini">Расходы на образование, здравоохранение, инфраструктуру и науку медленно (годами) меняют соответствующие индексы. Субсидии ускоряют рост отраслей. Коррупция съедает часть эффекта.</div></section>`;
}

function society() {
  const C = P(), pol = C.pol, M = lawMods(C), T = groupTargets(C, M), s = C.soc, e = C.eco;
  const tmp = {}; for (const m of pol.gmods) tmp[m.g] = (tmp[m.g] || 0) + m.v;
  const groups = Object.entries(GROUPS).map(([g, G0]) => {
    const v = pol.groups[g] ?? 50;
    const worst = [...T[g].drivers].sort((a, b) => a.v - b.v).slice(0, 2).map((d) => `${d.name} <b class="${cls(d.v > 50)}">${nf(d.v)}</b>`).join(' · ');
    const lm = M.groups[g] || 0, tm = tmp[g] || 0;
    return `<div class="grp"><div class="grp-h"><span class="gi">${G0.icon}</span><b>${G0.name}</b><small>${pct(pol.groupShares[g], 0)} населения${G0.elite ? ' · элита' : ''}</small><em>${nf(v)}</em></div>${bar(v)}
      <div class="mini">Волнует: ${worst}${lm ? ` · законы <b class="${cls(lm > 0)}">${lm > 0 ? '+' : ''}${nf(lm)}</b>` : ''}${tm ? ` · события <b class="${cls(tm > 0)}">${tm > 0 ? '+' : ''}${nf(tm)}</b>` : ''}${pol.fatigue > 1 ? ` · усталость от власти <b class="bad">−${nf(pol.fatigue)}</b>` : ''}</div></div>`;
  }).join('');
  const idx = [['Образование', s.edu], ['Здравоохранение', s.health], ['Инфраструктура', s.infra], ['Наука', s.science], ['Свобода', s.freedom], ['Коррупция', s.corruption]];
  return `
  <section class="kpis">${kpi('Одобрение', nf(pol.approval), 'взвешено по населению')}${kpi('Стабильность', nf(pol.stability), pol.stability < 35 ? 'опасно' : 'норма')}${kpi('Население', nf(C.pop, 1) + ' млн', spct(C.pop_g || 0, 2) + ' в год')}${kpi('Неравенство', nf(e.gini, 2), 'Джини')}</section>
  <section class="card"><h4>Социальные группы</h4>${groups}</section>
  <section class="card"><h4>Индексы развития</h4>${idx.map(([n, v]) => `<div class="irow"><span>${n}</span>${bar(n === 'Коррупция' ? v : v, n === 'Коррупция' ? barColor(100 - v) : null)}<b>${nf(v)}</b></div>`).join('')}</section>`;
}

function hemicycle(seats) {
  const order = ['left', 'green', 'lib', 'cons', 'nat'];
  const list = []; for (const p of order) for (let i = 0; i < (seats[p] || 0); i++) list.push(p);
  let h = ''; const rows = [12, 16, 20, 24, 28]; let k = 0;
  const pts = [];
  rows.forEach((n, ri) => { const R = 40 + ri * 13; for (let i = 0; i < n; i++) { const a = Math.PI - Math.PI * (i / (n - 1)); pts.push([a, 120 + R * Math.cos(a), 115 - R * Math.sin(a)]); } });
  pts.sort((a, b) => b[0] - a[0]);
  for (const [, x, y] of pts) { const p = list[k++]; if (!p) break; h += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.3" fill="${PARTIES[p].color}"/>`; }
  return `<svg viewBox="0 0 240 122" class="hemi">${h}<line x1="120" y1="20" x2="120" y2="118" stroke="#fff3" stroke-dasharray="2 3"/></svg>`;
}

function politics() {
  const C = P(), pol = C.pol;
  const every = GOV[C.gov].electionEvery;
  const sup = Object.entries(pol.support).sort((a, b) => b[1] - a[1]).map(([p, v]) => `
    <div class="party"><span class="pdot" style="background:${PARTIES[p].color}"></span><b>${PARTIES[p].name}</b>${p === C.party ? '<span class="pill gold">правящая</span>' : pol.coalition.includes(p) ? '<span class="pill">коалиция</span>' : ''}
    <em>${pct(v, 1)}</em><small>${pol.seats[p] || 0} мест</small>${bar(v * 250, PARTIES[p].color)}</div>`).join('');
  const coalSeats = pol.coalition.reduce((s, p) => s + (pol.seats[p] || 0), 0);
  const D = (id, name, cost, desc, dis = '') => `<div class="decree"><div><b>${name}</b><small>${desc}</small></div><button class="btn" data-act="decree" data-id="${id}" ${dis ? `disabled title="${dis}"` : ''}>${cost}</button></div>`;
  return `
  <section class="kpis">${kpi('Политкапитал', nf(pol.pc), '+' + nf(0.8 + pol.approval / 45 + GOV[C.gov].pcBonus - lawMods(C).pcUpkeep, 1) + ' в месяц')}${kpi('Режим', GOV[C.gov].name, 'свобода ' + nf(C.soc.freedom))}${kpi('Выборы', every ? `через ${pol.nextElection} мес.` : 'не проводятся', every ? 'каждые ' + every / 12 + ' лет' : '')}${kpi('Коалиция', coalSeats + ' / 100', pol.coalition.map((p) => PARTIES[p].short).join(' + '))}</section>
  <section class="card"><h4>Парламент</h4>${hemicycle(pol.seats)}${pol.lastElection ? `<div class="mini">Последние выборы: ${pol.lastElection.d}</div>` : ''}</section>
  <section class="card"><h4>Рейтинги партий</h4>${sup}<div class="mini">Поддержка правящей партии зависит от удовлетворённости групп, которые за неё голосуют. Недовольные уходят к оппозиции.</div></section>
  <section class="card"><h4>Указы и политические решения</h4>
    ${D('propaganda', 'Информационная кампания', '10 ПК', 'Все группы +4 на полгода.')}
    ${D('reshuffle', 'Перестановки в правительстве', '25 ПК', 'Снимает часть «усталости от власти», убирает негатив от событий.')}
    ${Object.entries(GROUPS).map(([g, x]) => D('pay_' + g, `Программа для группы «${x.name}»`, '6 ПК + 0,3% ВВП', `${x.name}: +12 на год.`)).join('')}
    ${every ? D('snap', 'Досрочные выборы', '15 ПК', 'Обновить парламент сейчас, пока рейтинг высок.') : ''}
  </section>`;
}

const MOD_N = {
  growth: ['Рост экономики', (v) => spct(v, 1)], growthTech: ['Рост хай-тека', (v) => spct(v, 1)], growthInd: ['Рост промышленности', (v) => spct(v, 1)], growthAgri: ['Рост АПК', (v) => spct(v, 1)], growthMining: ['Рост добычи', (v) => spct(v, 1)],
  nairu: ['Безработица', (v) => spct(v, 1), true], gini: ['Неравенство', (v) => (v > 0 ? '+' : '') + nf(v, 2), true], freedom: ['Свобода', (v) => (v > 0 ? '+' : '') + v], corruption: ['Коррупция', (v) => (v > 0 ? '+' : '') + v, true],
  stability: ['Стабильность', (v) => (v > 0 ? '+' : '') + v], openness: ['Открытость торговли', (v) => spct(v, 0)], inflation: ['Инфляция', (v) => spct(v, 1), true], compliance: ['Собираемость', (v) => spct(v, 0)],
  invest: ['Инвестиции', (v) => spct(v, 1)], popGrowth: ['Прирост населения', (v) => spct(v, 1)], manpower: ['Мобресурс', (v) => spct(v, 0)], milQuality: ['Качество армии', (v) => spct(v, 0)], socialSave: ['Экономия соцрасходов', (v) => pct(v, 1) + ' ВВП'],
  eduT: ['Образование', (v) => '+' + v], healthT: ['Здравоохранение', (v) => '+' + v], sciT: ['Наука', (v) => '+' + v], infraT: ['Инфраструктура', (v) => '+' + v], electionBonus: ['Бонус на выборах', (v) => spct(v, 0)],
  resRent: ['Ресурсная рента', (v) => spct(v, 0)], confidence: ['Доверие бизнеса', (v) => (v > 0 ? '+' : '') + v], spendExtra: ['Расходы', (v) => '+' + pct(v, 1) + ' ВВП', true], credibility: ['Доверие к ЦБ', (v) => spct(v, 0)], incBoost: ['Доход НДФЛ', (v) => spct(v, 0)],
  pcUpkeep: ['Политкапитал/мес', (v) => '−' + v, true], rateRule: ['Ставка по правилу Тейлора', () => ''], tariffCap: ['Пошлины не выше', (v) => pct(v, 0)],
};
function lawEffects(L) {
  const m = Object.entries(L.mods || {}).map(([k, v]) => { const d = MOD_N[k]; if (!d) return ''; const good = d[2] ? v < 0 : v > 0; return `<span class="eff ${k === 'rateRule' || k === 'tariffCap' ? '' : cls(good)}">${d[0]} ${d[1](v)}</span>`; }).join('');
  const g = Object.entries(L.groups || {}).map(([k, v]) => `<span class="eff ${cls(v > 0)}">${GROUPS[k].icon} ${v > 0 ? '+' : ''}${v}</span>`).join('');
  return m + g + (L.onPass?.cash ? `<span class="eff good">Разово +${pct(L.onPass.cash, 0)} ВВП в бюджет</span>` : '');
}

function laws() {
  const C = P();
  const cats = Object.entries(LAW_CATS).map(([k, n]) => `<button data-act="lawcat" data-id="${k}" class="${k === lawCat ? 'on' : ''}">${n}</button>`).join('');
  const list = LAWS.filter((L) => L.cat === lawCat).map((L) => {
    const active = C.pol.laws.includes(L.id);
    const av = lawAvailable(C, L.id);
    const v = lawVote(G, C, L.id, active);
    const pc = active ? Math.ceil(L.pc * 0.6) : L.pc;
    const conflict = !active && L.excl ? C.pol.laws.map((id) => LAW_BY_ID[id]).find((x) => x.excl === L.excl) : null;
    const votes = Object.entries(v.parties).map(([p, y]) => `<span class="vote ${y ? 'y' : 'n'}" style="--pc:${PARTIES[p].color}" title="${PARTIES[p].name}: ${y ? 'за' : 'против'}">${PARTIES[p].short} ${C.pol.seats[p]}</span>`).join('');
    let btns = '';
    if (active) btns = L.regime ? '<span class="pill gold">Действует</span>' : `<span class="pill gold">Действует</span><button class="btn ghost" data-act="repeal" data-id="${L.id}" ${v.pass ? '' : 'disabled'}>Отменить · ${pc} ПК</button>${v.pass ? '' : `<button class="btn ghost" data-act="repeal_lobby" data-id="${L.id}">Продавить отмену · ${pc + v.lobbyCost} ПК</button>`}`;
    else if (!av.ok) btns = `<span class="pill">${av.why}</span>`;
    else btns = v.pass ? `<button class="btn" data-act="pass" data-id="${L.id}">Принять · ${pc} ПК</button>` : `<button class="btn warn" data-act="pass_lobby" data-id="${L.id}">Продавить · ${pc + v.lobbyCost} ПК</button>`;
    return `<div class="law ${active ? 'active' : ''}"><div class="law-h"><b>${L.name}</b>${btns}</div><p>${L.desc}</p><div class="effs">${lawEffects(L)}</div>
      <div class="votes">${C.gov === 'autocracy' ? '<small>Парламент послушен</small>' : `<small>Голоса «за»: <b class="${cls(v.pass)}">${v.yes}</b>/100</small>${votes}`}${conflict ? `<small class="warnt">Заменит: «${conflict.name}»</small>` : ''}</div></div>`;
  }).join('');
  return `<div class="subtabs">${cats}</div><section>${list}</section>`;
}

function relTag(v) { return `<span class="rel" style="--rv:${v}">${v > 0 ? '+' : ''}${nf(v)}</span>`; }

function diplomacy() {
  const C = P();
  if (!selC || selC === G.player || !G.countries[selC].alive) selC = alive(G).find((x) => x.id !== G.player)?.id;
  const list = alive(G).filter((X) => X.id !== G.player).sort((a, b) => G.rel[G.player][b.id] - G.rel[G.player][a.id]).map((X) => {
    const icons = [atWar(G, G.player, X.id) ? '⚔' : '', hasTreaty(G, 'alliance', G.player, X.id) ? '🛡' : '', hasTreaty(G, 'trade', G.player, X.id) ? '⇄' : '', hasTreaty(G, 'nap', G.player, X.id) ? '☮' : '', sanctioned(G, G.player, X.id) ? '⛔→' : '', sanctioned(G, X.id, G.player) ? '←⛔' : '', borders(G, G.player, X.id) ? '▦' : ''].join(' ');
    return `<button class="drow ${X.id === selC ? 'on' : ''}" data-act="selc" data-id="${X.id}"><span class="flag" style="background:${X.color}"></span><b>${X.short}</b><small>${icons}</small>${relTag(G.rel[G.player][X.id])}</button>`;
  }).join('');
  const X = G.countries[selC];
  const acts = Object.entries(ACTIONS).map(([a, A]) => {
    const c = canDo(G, G.player, X.id, a);
    if (!c.ok && /Нет|Уже|Санкций нет|Мир заключают|Нет союза|Нет соглашения/.test(c.why)) return '';
    return `<button class="act ${a === 'war' ? 'danger' : ''}" data-act="diplo" data-id="${a}" ${c.ok ? '' : `disabled title="${c.why}"`}><b>${A.name}</b><small>${A.desc}</small><em>${A.pc} ПК</em>${c.ok ? '' : `<i>${c.why}</i>`}</button>`;
  }).join('');
  const blocs = Object.entries(BLOCS).map(([b, B]) => `<button class="btn ${C.bloc === b ? 'on' : 'ghost'}" data-act="bloc" data-id="${b}" ${C.bloc === b ? 'disabled' : ''}>${b === 'none' ? 'Нейтралитет' : B.name}</button>`).join('');
  const xs = strength(G, X), ms = strength(G, C);
  return `
  <section class="card"><h4>Блок</h4><div class="row">Сейчас: <b style="color:${BLOCS[C.bloc].color}">${BLOCS[C.bloc].name}</b></div><div class="row">${blocs}</div><div class="mini">Вступление (20 ПК) требует средних отношений ≥ 35 с членами блока. Даёт торговые соглашения со всеми членами, но портит отношения с соперниками.</div></section>
  <div class="diplo">
    <div class="dlist">${list}<div class="mini legend">⚔ война · 🛡 союз · ⇄ торговля · ☮ пакт · ⛔ санкции · ▦ граница</div></div>
    <div class="ddet">
      <div class="dhead"><span class="flag big" style="background:${X.color}"></span><div><h3>${X.name}</h3><small>${GOV[X.gov].name} · у власти ${PARTIES[X.party].name} · ${BLOCS[X.bloc].name}</small></div></div>
      <div class="kv">
        <div><span>Отношение к нам</span><b>${relTag(G.rel[X.id][G.player])}</b></div>
        <div><span>ВВП / на душу</span><b>${bn(X.eco.gdp)} · ${nf(X.eco.gdp / X.pop * 1000)} $</b></div>
        <div><span>Население</span><b>${nf(X.pop, 1)} млн</b></div>
        <div><span>Рост / инфляция</span><b>${spct(X.eco.growth)} / ${pct(X.eco.infl)}</b></div>
        <div><span>Стабильность</span><b>${nf(X.pol.stability)}</b></div>
        <div><span>Военная мощь</span><b class="${cls(ms >= xs)}">${nf(xs)} (у нас ${nf(ms)})</b></div>
        <div><span>Торговля с нами</span><b>экспорт ${bn(C.trade.exBy[X.id] || 0)} · импорт ${bn(C.trade.imBy[X.id] || 0)} <a class="clink" data-act="partner" data-id="${X.id}">профиль →</a></b></div>
        <div><span>Союзники</span><b>${alive(G).filter((Y) => Y.id !== X.id && hasTreaty(G, 'alliance', X.id, Y.id)).map((Y) => Y.short).join(', ') || '—'}</b></div>
      </div>
      <div class="acts">${acts}</div>
    </div>
  </div>`;
}

function military() {
  const C = P(), e = C.eco, M = lawMods(C);
  const ws = wars(G, C.id).map((w) => {
    const mine = w.sideA.includes(C.id); const my = mine ? w.score : -w.score;
    const enemy = mine ? w.sideB : w.sideA, friends = mine ? w.sideA : w.sideB;
    const occ = G.provs.filter((p) => p.land && enemy.includes(p.owner) && friends.includes(p.ctrl)).length;
    const lost = G.provs.filter((p) => p.land && friends.includes(p.owner) && enemy.includes(p.ctrl)).length;
    const lead = mine ? w.b : w.a;
    return `<div class="war"><div class="war-h"><b>⚔ ${friends.map((i) => G.countries[i].short).join(', ')} против ${enemy.map((i) => G.countries[i].short).join(', ')}</b><small>${w.months} мес.</small></div>
      <div class="front"><i style="left:${50 + my / 2}%"></i></div><div class="row mini"><span>Перевес: <b class="${cls(my >= 0)}">${nf(my)}</b></span><span>Занято нами: ${occ} пров.</span><span>Потеряно: ${lost} пров.</span></div>
      ${(w.a === C.id || w.b === C.id) ? `<div class="row"><button class="btn" data-act="peace" data-id="${lead}" data-t="peace_white">Предложить статус-кво</button><button class="btn warn" data-act="peace" data-id="${lead}" data-t="peace_annex">Потребовать аннексии</button></div>` : '<div class="mini">Вы участвуете как союзник — мир заключают лидеры.</div>'}</div>`;
  }).join('') || '<div class="mini">Мирное время.</div>';
  const rank = alive(G).map((X) => [X, strength(G, X)]).sort((a, b) => b[1] - a[1]);
  const max = rank[0][1];
  return `
  <section class="kpis">${kpi('Военная мощь', nf(strength(G, C)), 'место ' + (rank.findIndex(([X]) => X.id === C.id) + 1) + ' из ' + rank.length)}${kpi('Арсенал', bn(C.mil.equip), 'накопленное вооружение')}${kpi('Боевой дух', nf(C.mil.morale * 100), '%')}${kpi('Усталость от войны', nf(C.pol.warWeariness), '')}</section>
  <section class="card"><h4>Управление</h4>
    ${slider('spend.defense', 'Оборонный бюджет', e.spend.defense, 0, 0.12, 0.001, pct(e.spend.defense) + ' ВВП · ' + bn(e.spend.defense * e.gdp))}
    <div class="row"><label><input type="checkbox" data-k="mobilized" ${C.mil.mobilized ? 'checked' : ''}> Мобилизация (мощь ×1,4, расходы +1,2% ВВП, недовольство)</label></div>
    <div class="mini">Армия: ${M.manpower > 0.2 ? 'призывная' : M.milQuality > 0 ? 'контрактная' : 'смешанная'}. Изменить можно во вкладке «Законы → Оборона».</div></section>
  <section class="card"><h4>Войны</h4>${ws}</section>
  <section class="card"><h4>Баланс сил</h4>${rank.map(([X, s]) => `<div class="irow"><span><span class="flag" style="background:${X.color}"></span> ${X.short}</span>${bar(s / max * 100, X.color)}<b>${nf(s)}</b></div>`).join('')}</section>`;
}

function world() {
  const rows = alive(G).sort((a, b) => b.eco.gdp - a.eco.gdp).map((X) => `<tr class="${X.id === G.player ? 'me' : ''}" data-act="selc_go" data-id="${X.id}">
    <td><span class="flag" style="background:${X.color}"></span>${X.short}</td><td>${bn(X.eco.gdp)}</td><td>${nf(X.eco.gdp / X.pop, 1)}k</td><td class="${cls(X.eco.growth > 0.015)}">${spct(X.eco.growth)}</td>
    <td>${pct(X.eco.infl)}</td><td>${pct(X.eco.debt / X.eco.gdp, 0)}</td><td>${nf(X.pol.stability)}</td><td>${GOV[X.gov].name.split(' ')[0]}</td><td>${PARTIES[X.party].short}</td><td>${X.eco.rating}</td></tr>`).join('');
  const dead = Object.values(G.countries).filter((X) => !X.alive).map((X) => X.short).join(', ');
  return `<section class="grid2"><div class="card"><h4>ВВП стран, млрд $</h4><canvas data-chart="w_gdp"></canvas></div><div class="card"><h4>Объём мировой торговли, млрд $/год</h4><canvas data-chart="w_trade"></canvas></div></section>
  <section class="card"><h4>Мировой рейтинг</h4><table class="tbl world"><tr><th>Страна</th><th>ВВП</th><th>на душу</th><th>Рост</th><th>Инфл.</th><th>Долг</th><th>Стаб.</th><th>Режим</th><th>Власть</th><th>Рейт.</th></tr>${rows}</table>${dead ? `<div class="mini">Исчезли с карты: ${dead}</div>` : ''}</section>
  <section class="card"><h4>Текущие войны</h4>${G.wars.map((w) => `<div class="row">⚔ ${w.sideA.map((i) => G.countries[i].short).join(', ')} — ${w.sideB.map((i) => G.countries[i].short).join(', ')} <small>(${w.months} мес., счёт ${nf(w.score)})</small></div>`).join('') || '<div class="mini">Мир во всём мире.</div>'}</section>
  <section class="card"><h4>Цель партии</h4><div class="mini">Продержаться у власти до ${END_YEAR} года. Итоговый счёт учитывает рост ВВП на душу, одобрение, стабильность, территорию и долговую нагрузку. Текущий счёт: <b>${nf(score(G, P()))}</b></div></section>`;
}


// =================== ТОРГОВЛЯ ===================
const CAT_ORDER = ['raw', 'agri', 'industry', 'tech', 'services'];
const dateLbl = (i, n) => { const back = n - 1 - i; let m = G.month - 1 - back, y = G.year; while (m < 0) { m += 12; y--; } return ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][m] + ' ' + y; };
const gPrice = (gid) => G.goods[gid].p;
const gDisp = (gid) => gPrice(gid) * GOOD[gid].base;
const priceStr = (gid) => { const v = gDisp(gid); return (v >= 1000 ? nf(v, 0) : v >= 10 ? nf(v, 1) : nf(v, 2)) + ' ' + GOOD[gid].unit; };
const chg12 = (gid) => { const h = G.goods[gid].hist; return h.length > 12 ? h[h.length - 1] / h[h.length - 13] - 1 : (h.length ? h[h.length - 1] / GOOD[gid].base - 1 : 0); };
const flagOf = (id) => `<span class="flag" style="background:${G.countries[id].color}"></span>`;
const cname = (id) => `<a class="clink" data-act="partner" data-id="${id}">${flagOf(id)}${G.countries[id].short}</a>`;
const glink = (gid) => `<a class="glink" data-act="good" data-id="${gid}">${GOOD[gid].icon} ${GOOD[gid].name}</a>`;
const sumSeries = (arrs) => { const n = Math.max(0, ...arrs.map((a) => a.length)); const out = Array(n).fill(0); for (const a of arrs) { const off = n - a.length; a.forEach((v, i) => (out[off + i] += v)); } return out; };

function tradeTab() {
  if (tradeView.v === 'good') return goodView(tradeView.id);
  if (tradeView.v === 'partner' && G.countries[tradeView.id]?.alive) return partnerView(tradeView.id);
  return tradeList();
}

function syncTradeMap() {
  if (tab !== 'trade') { map.setFlows([], null); if (map.mode === 'good') map.setMode('political'); return; }
  const P0 = G.player;
  if (tradeView.v === 'good') {
    const gid = tradeView.id;
    const fl = (G.flows[gid] || []).slice(0, 24).map(([a, b, v]) => ({ from: a, to: b, value: v, color: a === P0 ? '#e8b64a' : b === P0 ? '#4c8dff' : GOOD_CATS[GOOD[gid].cat].color, label: `${G.countries[a].short} → ${G.countries[b].short}: ${bn(v)}` }));
    map.mode = 'good'; for (const x of $('#modes').children) x.classList.toggle('on', x.dataset.mode === 'good');
    map.setFlows(fl, gid);
  } else if (tradeView.v === 'partner') {
    if (map.mode === 'good') map.mode = 'political';
    const id = tradeView.id, fl = [];
    for (const g of GOODS) for (const [a, b, v] of G.flows[g.id] || []) {
      if ((a === P0 && b === id) || (a === id && b === P0)) fl.push({ from: a, to: b, value: v, color: GOOD_CATS[g.cat].color, label: `${g.name}: ${G.countries[a].short} → ${G.countries[b].short} ${bn(v)}` });
    }
    fl.sort((x, y) => y.value - x.value);
    map.setFlows(fl.slice(0, 12), null);
  } else {
    if (map.mode === 'good') map.mode = 'political';
    for (const x of $('#modes').children) x.classList.toggle('on', x.dataset.mode === map.mode);
    const C = P(), fl = [];
    for (const [d, v] of Object.entries(C.trade.exBy)) if (v > 0) fl.push({ from: P0, to: d, value: v, color: '#e8b64a', label: `Экспорт в ${G.countries[d].short}: ${bn(v)}` });
    for (const [d, v] of Object.entries(C.trade.imBy)) if (v > 0) fl.push({ from: d, to: P0, value: v, color: '#4c8dff', label: `Импорт из ${G.countries[d].short}: ${bn(v)}` });
    map.setFlows(fl, null);
  }
}

function tradeList() {
  const C = P(), T = C.trade, e = C.eco;
  const world = alive(G).reduce((s, X) => s + X.trade.ex, 0);
  // условия торговли: средняя цена экспорта / средняя цена импорта
  let exP = 0, exW = 0, imP = 0, imW = 0;
  for (const g of GOODS) { const s = C.gs[g.id]; exP += s.ex * gPrice(g.id); exW += s.ex; imP += s.im * gPrice(g.id); imW += s.im; }
  const tot = exW && imW ? (exP / exW) / (imP / imW) : 1;
  const partners = Object.keys(T.exBy).filter((d) => T.exBy[d] + T.imBy[d] > 0.5).length;
  const exRows = Object.entries(T.exBy).filter(([, v]) => v > 0.01).sort((a, b) => b[1] - a[1]).map(([d, v]) => ({ label: `${flagOf(d)}${G.countries[d].short}`, value: v, color: '#e8b64a', act: 'partner', id: d, sub: pct(v / T.ex, 0) }));
  const imRows = Object.entries(T.imBy).filter(([, v]) => v > 0.01).sort((a, b) => b[1] - a[1]).map(([d, v]) => ({ label: `${flagOf(d)}${G.countries[d].short}`, value: v, color: '#4c8dff', act: 'partner', id: d, sub: pct(v / T.im, 0) }));
  const cats = ['all', ...CAT_ORDER].map((c) => `<button data-act="tcat" data-id="${c}" class="${tradeCat === c ? 'on' : ''}">${c === 'all' ? 'Все товары' : GOOD_CATS[c].name}</button>`).join('');
  let list = GOODS.filter((g) => tradeCat === 'all' || g.cat === tradeCat).map((g) => ({ g, s: C.gs[g.id] }));
  const key = { name: (r) => r.g.name, price: (r) => chg12(r.g.id), prod: (r) => r.s.prod * gPrice(r.g.id), dem: (r) => r.s.dem * gPrice(r.g.id), ex: (r) => r.s.ex * gPrice(r.g.id), im: (r) => r.s.im * gPrice(r.g.id), self: (r) => r.s.prod / Math.max(1e-6, r.s.dem) }[tradeSort.k];
  list.sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * tradeSort.d; });
  const th = (k, n) => `<th data-act="tsort" data-id="${k}" class="sortable">${n}${tradeSort.k === k ? (tradeSort.d > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const rows = list.map(({ g, s }) => {
    const pr = gPrice(g.id), self = s.prod / Math.max(1e-6, s.dem), c = chg12(g.id);
    const flags = [C.tp.ban[g.id] ? '<span class="tflag bad" title="Запрет экспорта">⛔</span>' : '', C.tp.tariff[g.id] != null ? `<span class="tflag" title="Особая пошлина">${pct(C.tp.tariff[g.id], 0)}</span>` : '', C.tp.duty[g.id] ? `<span class="tflag" title="Экспортная пошлина">↑${pct(C.tp.duty[g.id], 0)}</span>` : '', C.tp.sub[g.id] ? `<span class="tflag good" title="Субсидия">₽${pct(C.tp.sub[g.id], 0)}</span>` : '', s.shortR > 0.05 ? `<span class="tflag bad" title="Дефицит">дефицит ${pct(s.shortR, 0)}</span>` : ''].join('');
    return `<tr class="click" data-act="good" data-id="${g.id}"><td><span class="gico">${g.icon}</span>${g.name} ${flags}</td><td class="num">${priceStr(g.id)}</td><td class="num ${c >= 0 ? 'up' : 'down'}">${spct(c, 0)}</td><td>${spark(G.goods[g.id].hist.slice(-60), 'auto', 64, 20)}</td>
      <td class="num">${bn(s.prod * pr)}</td><td class="num">${bn(s.dem * pr)}</td><td class="num up">${s.ex > 0.005 ? bn(s.ex * pr) : '—'}</td><td class="num down">${s.im > 0.005 ? bn(s.im * pr) : '—'}</td>
      <td><div class="selfbar" title="Самообеспеченность ${pct(self, 0)}"><i style="width:${Math.min(100, self * 50)}%;background:${self >= 1 ? '#43c37a' : self > 0.6 ? '#e8a33c' : '#ef5a4f'}"></i><em></em></div></td></tr>`;
  }).join('');
  return `
  <section class="kpis">${kpi('Экспорт', bn(T.ex), pct(T.ex / e.gdp) + ' ВВП')}${kpi('Импорт', bn(T.im), pct(T.im / e.gdp) + ' ВВП')}${kpi('Сальдо', `<span class="${cls(T.ex >= T.im)}">${bn(T.ex - T.im)}</span>`, spct((T.ex - T.im) / e.gdp) + ' ВВП')}
    ${kpi('Доля в мировом экспорте', pct(T.ex / Math.max(1, world)), 'мировая торговля ' + bn(world))}${kpi('Условия торговли', nf(tot, 2), tot > 1 ? 'экспорт дороже импорта' : 'импорт дороже экспорта')}${kpi('Партнёров', partners, 'пошлины: ' + pct(e.tax.tariff, 0))}</section>
  <section class="grid2">
    <div class="card"><h4>Экспорт и импорт, млрд $/год</h4><canvas data-chart="tr_exim"></canvas></div>
    <div class="card"><h4>Структура экспорта</h4><canvas data-chart="tr_excat"></canvas></div>
    <div class="card"><h4>Куда продаём</h4>${hbars(exRows, bn)}</div>
    <div class="card"><h4>Откуда покупаем</h4>${hbars(imRows, bn)}</div>
  </section>
  <section class="card"><h4>Товары · клик — подробности, потоки, политика</h4><div class="subtabs">${cats}</div>
    <div class="tblwrap"><table class="tbl goods"><tr>${th('name', 'Товар')}<th>Мировая цена</th>${th('price', '12 мес')}<th>5 лет</th>${th('prod', 'Произв.')}${th('dem', 'Потребл.')}${th('ex', 'Экспорт')}${th('im', 'Импорт')}${th('self', 'Самообесп.')}</tr>${rows}</table></div>
    <div class="mini">Стоимость — в млрд $ в год по текущим мировым ценам. Потребление включает промышленный спрос (сырьё для других отраслей). Шкала самообеспеченности: середина — 100%.</div></section>
  <section class="card"><h4>Ценовые индексы мировых рынков (2030 = 100)</h4><canvas data-chart="tr_catidx"></canvas></section>
  <section class="card"><h4>Общая торговая политика</h4>${slider('tax.tariff', 'Базовая импортная пошлина (для всех товаров без особой ставки)', e.tax.tariff, 0, 0.4, 0.005, pct(e.tax.tariff, 1))}
    <div class="mini">Пошлины поднимают внутренние цены импорта и сокращают спрос на него; доход идёт в бюджет. Особые ставки, экспортные пошлины, запреты, субсидии и эмбарго настраиваются в карточке каждого товара.</div></section>`;
}

function goodView(gid) {
  const C = P(), g = GOOD[gid], s = C.gs[gid], pr = gPrice(gid), gm = G.goods[gid];
  const rows = alive(G).map((X) => ({ X, s: X.gs[gid] }));
  const prodRows = rows.filter((r) => r.s.prod > 0.001).sort((a, b) => b.s.prod - a.s.prod).map((r) => ({ label: `${flagOf(r.X.id)}${r.X.short}`, value: r.s.prod * pr, color: r.X.id === G.player ? '#e8b64a' : r.X.color, act: 'partner', id: r.X.id }));
  const demRows = rows.filter((r) => r.s.dem > 0.001).sort((a, b) => b.s.dem - a.s.dem).map((r) => ({ label: `${flagOf(r.X.id)}${r.X.short}`, value: r.s.dem * pr, color: r.X.id === G.player ? '#e8b64a' : r.X.color, act: 'partner', id: r.X.id, sub: r.s.shortR > 0.02 ? `<span class="bad">дефицит ${pct(r.s.shortR, 0)}</span>` : '' }));
  const fl = G.flows[gid] || [];
  const fTot = fl.reduce((t, f) => t + f[2], 0);
  const flowRows = fl.slice(0, 30).map(([a, b, v]) => `<tr class="${a === G.player || b === G.player ? 'me' : ''}"><td>${cname(a)}</td><td class="arrow">→</td><td>${cname(b)}</td><td class="num">${bn(v)}</td><td class="num">${pct(v / Math.max(1e-9, fTot), 1)}</td></tr>`).join('');
  const ins = Object.entries(IO[gid]).map(([i, a]) => `<div class="chain">${glink(i)}<span>${nf(a * 100, 0)}¢ на $1</span>${C.gs[i].shortR > 0.02 ? `<em class="bad">дефицит ${pct(C.gs[i].shortR, 0)}</em>` : `<em>${C.gs[i].prod >= C.gs[i].dem ? 'своё' : 'импорт ' + pct(C.gs[i].im / Math.max(1e-6, C.gs[i].dem), 0)}</em>`}</div>`).join('') || '<div class="mini">Первичный ресурс — добывается из недр/производится без сырья.</div>';
  const outs = (USED_IN[gid] || []).sort((a, b) => b[1] - a[1]).map(([o, a]) => `<div class="chain">${glink(o)}<span>${nf(a * 100, 0)}¢ на $1</span><em>${bn(C.gs[o].prod * a * pr)}</em></div>`).join('') || '<div class="mini">Только конечное потребление.</div>';
  const tariff = tariffOf(C, gid);
  const emb = alive(G).filter((X) => X.id !== G.player).map((X) => `<label class="embc"><input type="checkbox" data-k="tp.emb.${gid}>${X.id}" ${C.tp.emb[gid + '>' + X.id] ? 'checked' : ''}>${flagOf(X.id)}${X.short}</label>`).join('');
  const self = s.prod / Math.max(1e-6, s.dem);
  const sources = Object.entries(C.trade.imBy).length ? fl.filter((f) => f[1] === G.player).map(([a, , v]) => ({ label: `${flagOf(a)}${G.countries[a].short}`, value: v, color: '#4c8dff', act: 'partner', id: a, sub: pct(v / Math.max(1e-9, s.im * pr), 0) })) : [];
  const buyers = fl.filter((f) => f[0] === G.player).map(([, b, v]) => ({ label: `${flagOf(b)}${G.countries[b].short}`, value: v, color: '#e8b64a', act: 'partner', id: b, sub: pct(v / Math.max(1e-9, s.ex * pr), 0) }));
  return `
  <div class="crumbs"><a data-act="tback">← Все товары</a><span>${GOOD_CATS[g.cat].name}</span></div>
  <div class="ghead"><span class="gbig">${g.icon}</span><div><h3>${g.name}</h3><div class="gprice">${priceStr(gid)} <span class="${chg12(gid) >= 0 ? 'up' : 'down'}">${spct(chg12(gid))} за год</span> <span class="pill">${gm.lastExcess > 0.01 ? 'спрос превышает предложение' : gm.lastExcess < -0.01 ? 'избыток предложения' : 'рынок сбалансирован'}</span></div></div></div>
  <section class="card"><h4>Мировая цена, ${g.unit}</h4><canvas data-chart="g_price" data-g="${gid}"></canvas></section>
  <section class="kpis">${kpi('Производство', bn(s.prod * pr), 'загрузка ' + pct(s.prod / Math.max(1e-6, s.cap), 0))}${kpi('Потребление', bn(s.dem * pr), 'конечное ' + pct(G.fdK[gid] * s.F / Math.max(1e-6, s.dem), 0))}${kpi('Экспорт', bn(s.ex * pr), s.unsoldR > 0.02 ? `<span class="bad">не продано ${pct(s.unsoldR, 0)}</span>` : 'всё продано')}${kpi('Импорт', bn(s.im * pr), s.shortR > 0.02 ? `<span class="bad">дефицит ${pct(s.shortR, 0)}</span>` : 'спрос покрыт')}${kpi('Самообеспеченность', pct(self, 0), self >= 1 ? 'нетто-экспортёр' : 'нетто-импортёр')}${kpi('Внутренняя цена', nf(s.pLoc / pr * 100, 0) + '%', 'от мировой')}</section>
  <section class="grid2">
    <div class="card"><h4>Наш рынок, млрд $/год</h4><canvas data-chart="g_mine" data-g="${gid}"></canvas></div>
    <div class="card"><h4>Мировое производство и торговля</h4><canvas data-chart="g_world" data-g="${gid}"></canvas></div>
  </section>
  <section class="grid2">
    <div class="card"><h4>Из чего производится</h4>${ins}${IO[gid] && Object.keys(IO[gid]).length ? `<div class="mini">Доступность сырья для нашего производства: <b class="${cls(s.avail > 0.95)}">${pct(s.avail, 0)}</b></div>` : ''}</div>
    <div class="card"><h4>Где используется</h4>${outs}</div>
  </section>
  <section class="grid2">
    <div class="card"><h4>Кто производит</h4>${hbars(prodRows, bn)}</div>
    <div class="card"><h4>Кто потребляет</h4>${hbars(demRows, bn)}</div>
  </section>
  <section class="grid2">
    <div class="card"><h4>Наши покупатели</h4>${buyers.length ? hbars(buyers, bn) : '<div class="mini">Мы не экспортируем этот товар.</div>'}</div>
    <div class="card"><h4>Наши поставщики</h4>${sources.length ? hbars(sources, bn) : '<div class="mini">Мы не импортируем этот товар.</div>'}</div>
  </section>
  <section class="card"><h4>Мировые торговые потоки · ${bn(fTot)} в год</h4><div class="tblwrap"><table class="tbl flows"><tr><th>Экспортёр</th><th></th><th>Импортёр</th><th>Объём</th><th>Доля</th></tr>${flowRows || '<tr><td colspan="5" class="mini">Нет торговли — каждая страна обеспечивает себя сама.</td></tr>'}</table></div><div class="mini">Потоки показаны стрелками на карте: золотые — наш экспорт, синие — наш импорт. Цвет страны — нетто-экспорт (зелёный) или нетто-импорт (красный).</div></section>
  <section class="card"><h4>Наша политика по товару «${g.name}»</h4>
    ${slider('tp.tariff.' + gid, 'Импортная пошлина' + (C.tp.tariff[gid] == null ? ' (базовая)' : ' (особая)'), tariff, 0, 1, 0.01, pct(tariff, 0))}
    ${C.tp.tariff[gid] != null ? `<button class="btn ghost" data-act="tpreset" data-id="${gid}">Вернуть базовую ставку (${pct(C.eco.tax.tariff, 0)})</button>` : ''}
    ${slider('tp.duty.' + gid, 'Экспортная пошлина', C.tp.duty[gid] || 0, 0, 0.5, 0.01, pct(C.tp.duty[gid] || 0, 0), false, 'Доход бюджету, но наши поставки становятся менее конкурентными')}
    ${slider('tp.sub.' + gid, 'Субсидия производителям, % выручки', C.tp.sub[gid] || 0, 0, 0.3, 0.01, pct(C.tp.sub[gid] || 0, 0) + ' · ' + bn((C.tp.sub[gid] || 0) * s.prod * pr) + '/год', false, 'Отрасль постепенно растёт, экспорт дешевеет для покупателей')}
    <div class="row"><label><input type="checkbox" data-k="tp.ban.${gid}" ${C.tp.ban[gid] ? 'checked' : ''}> Запретить экспорт</label><span class="mini">Излишки остаются внутри — цены падают, производители теряют.</span></div>
    <h5 style="margin-top:12px">Товарное эмбарго (не продаём и не покупаем)</h5><div class="embs">${emb}</div>
  </section>`;
}

function partnerView(id) {
  const C = P(), X = G.countries[id], T = C.trade;
  const ex = T.exBy[id] || 0, im = T.imBy[id] || 0;
  const exG = [], imG = [];
  for (const g of GOODS) for (const [a, b, v] of G.flows[g.id] || []) {
    if (a === G.player && b === id) exG.push({ label: `${g.icon} ${g.name}`, value: v, color: GOOD_CATS[g.cat].color, act: 'good', id: g.id });
    if (a === id && b === G.player) imG.push({ label: `${g.icon} ${g.name}`, value: v, color: GOOD_CATS[g.cat].color, act: 'good', id: g.id });
  }
  exG.sort((a, b) => b.value - a.value); imG.sort((a, b) => b.value - a.value);
  // зависимость партнёра от нас и наша от него
  const dep = (from, to) => GOODS.map((g) => {
    const f = (G.flows[g.id] || []).find((r) => r[0] === from && r[1] === to); if (!f) return null;
    const dem = G.countries[to].gs[g.id].dem * gPrice(g.id);
    return { g, share: f[2] / Math.max(1e-9, dem), v: f[2] };
  }).filter((r) => r && r.share > 0.1).sort((a, b) => b.share - a.share);
  const theirDep = dep(G.player, id), ourDep = dep(id, G.player);
  const depRow = (r) => `<div class="chain">${glink(r.g.id)}<span>${pct(r.share, 0)} потребления</span><em>${bn(r.v)}</em></div>`;
  const xT = X.trade;
  const theirEx = GOODS.map((g) => ({ label: `${g.icon} ${g.name}`, value: xT.exG[g.id] || 0, color: GOOD_CATS[g.cat].color, act: 'good', id: g.id })).filter((r) => r.value > 0.01).sort((a, b) => b.value - a.value).slice(0, 8);
  const theirIm = GOODS.map((g) => ({ label: `${g.icon} ${g.name}`, value: xT.imG[g.id] || 0, color: GOOD_CATS[g.cat].color, act: 'good', id: g.id })).filter((r) => r.value > 0.01).sort((a, b) => b.value - a.value).slice(0, 8);
  const tags = [atWar(G, G.player, id) ? '<span class="pill bad">война</span>' : '', hasTreaty(G, 'trade', G.player, id) ? '<span class="pill gold">торговое соглашение</span>' : '', sanctioned(G, G.player, id) ? '<span class="pill bad">наши санкции</span>' : '', sanctioned(G, id, G.player) ? '<span class="pill bad">их санкции</span>' : '', hasTreaty(G, 'alliance', G.player, id) ? '<span class="pill">союз</span>' : ''].join('');
  return `
  <div class="crumbs"><a data-act="tback">← Торговля</a><span>Торговый профиль</span></div>
  <div class="ghead"><span class="flag big" style="background:${X.color}"></span><div><h3>${X.name}</h3><div class="row">${relTag(G.rel[G.player][id])} ${tags}<button class="btn ghost" data-act="selc_go" data-id="${id}">Дипломатия →</button></div></div></div>
  <section class="kpis">${kpi('Наш экспорт к ним', bn(ex), pct(ex / Math.max(1e-9, T.ex), 0) + ' нашего экспорта')}${kpi('Наш импорт от них', bn(im), pct(im / Math.max(1e-9, T.im), 0) + ' нашего импорта')}${kpi('Сальдо', `<span class="${cls(ex >= im)}">${bn(ex - im)}</span>`, '')}${kpi('Их ВВП', bn(X.eco.gdp), spct(X.eco.growth) + ' г/г')}${kpi('Их экспорт', bn(xT.ex), pct(xT.ex / X.eco.gdp, 0) + ' ВВП')}${kpi('Их импорт', bn(xT.im), pct(xT.im / X.eco.gdp, 0) + ' ВВП')}</section>
  <section class="card"><h4>Двусторонняя торговля, млрд $/год</h4><canvas data-chart="p_bi" data-c="${id}"></canvas></section>
  <section class="grid2">
    <div class="card"><h4>Что мы им продаём</h4>${exG.length ? hbars(exG, bn) : '<div class="mini">Ничего.</div>'}</div>
    <div class="card"><h4>Что мы у них покупаем</h4>${imG.length ? hbars(imG, bn) : '<div class="mini">Ничего.</div>'}</div>
  </section>
  <section class="grid2">
    <div class="card"><h4>Их зависимость от нас</h4>${theirDep.map(depRow).join('') || '<div class="mini">Критической зависимости нет.</div>'}<div class="mini">Эмбарго по этим товарам ударит по ним сильнее всего.</div></div>
    <div class="card"><h4>Наша зависимость от них</h4>${ourDep.map(depRow).join('') || '<div class="mini">Критической зависимости нет.</div>'}<div class="mini">Если они введут санкции — здесь возникнут дефициты.</div></div>
  </section>
  <section class="grid2">
    <div class="card"><h4>Главный экспорт ${X.short}</h4>${hbars(theirEx, bn)}</div>
    <div class="card"><h4>Главный импорт ${X.short}</h4>${hbars(theirIm, bn)}</div>
  </section>
  <section class="card"><h4>Экономика ${X.short}</h4><canvas data-chart="p_gdp" data-c="${id}"></canvas></section>`;
}

// ---------- графики ----------
function afterRender() {
  const h = P().hist;
  for (const cv of document.querySelectorAll('canvas[data-chart]')) {
    const k = cv.dataset.chart;
    if (k === 'gdp') lineChart(cv, [{ name: 'ВВП', data: h.gdp, color: '#e8b64a', fill: true }], { fmt: (v) => nf(v), labels: dateLbl });
    if (k === 'infl') lineChart(cv, [{ name: 'Инфляция', data: h.infl.map((v) => v * 100), color: '#e0473e' }, { name: 'Безработица', data: h.unemp.map((v) => v * 100), color: '#4c8dff' }], { fmt: (v) => nf(v, 1) + '%', zero: true, labels: dateLbl });
    if (k === 'appr') lineChart(cv, [{ name: 'Одобрение', data: h.approval, color: '#3fbf6f' }, { name: 'Стабильность', data: h.stability, color: '#c9a0ff' }], { fmt: (v) => nf(v), labels: dateLbl });
    const C = P(), lab = dateLbl, gid = cv.dataset.g, cid = cv.dataset.c;
    if (k === 'e_sect') lineChart(cv, [{ name: 'АПК', data: h.agri, color: '#7fb24a' }, { name: 'Добыча', data: h.mining, color: '#c77d3a' }, { name: 'Промышл.', data: h.industry, color: '#4c8dff' }, { name: 'Хай-тек', data: h.tech, color: '#b78cff' }, { name: 'Услуги', data: h.services, color: '#3fc1c9' }], { stacked: true, fmt: (v) => nf(v), labels: lab });
    if (k === 'e_growth') lineChart(cv, [{ name: 'Рост г/г', data: h.gdp.map((v, i) => (i >= 12 ? (v / h.gdp[i - 12] - 1) * 100 : NaN)), color: '#e8b64a' }], { fmt: (v) => nf(v, 1) + '%', zero: true, labels: lab });
    if (k === 'e_rate') lineChart(cv, [{ name: 'Ставка', data: h.rate.map((v) => v * 100), color: '#e8b64a' }, { name: 'Инфляция', data: h.infl.map((v) => v * 100), color: '#ef5a4f' }], { fmt: (v) => nf(v, 1) + '%', zero: true, labels: lab });
    if (k === 'e_fx') lineChart(cv, [{ name: 'Курс (выше — слабее)', data: h.fx, color: '#3fc1c9' }, { name: 'Цены корзины ×100', data: h.cpi.map((v) => v * 100), color: '#f2994a' }], { fmt: (v) => nf(v), labels: lab });
    if (k === 'e_unemp') lineChart(cv, [{ name: 'Безработица', data: h.unemp.map((v) => v * 100), color: '#4c8dff', fill: true }], { fmt: (v) => nf(v, 1) + '%', labels: lab });
    if (k === 'e_conf') lineChart(cv, [{ name: 'Доверие', data: h.conf, color: '#43c37a', fill: true }], { fmt: (v) => nf(v), labels: lab });
    if (k === 'b_revexp') lineChart(cv, [{ name: 'Доходы', data: h.rev, color: '#43c37a' }, { name: 'Расходы', data: h.exp, color: '#ef5a4f' }], { fmt: (v) => nf(v), labels: lab });
    if (k === 'tr_exim') lineChart(cv, [{ name: 'Экспорт', data: h.ex, color: '#e8b64a' }, { name: 'Импорт', data: h.im, color: '#4c8dff' }, { name: 'Сальдо', data: h.ex.map((v, i) => v - h.im[i]), color: '#9aa4b2' }], { fmt: (v) => nf(v), zero: true, labels: lab });
    if (k === 'tr_excat') lineChart(cv, CAT_ORDER.map((c) => ({ name: GOOD_CATS[c].name.split(' ')[0], data: sumSeries(GOODS.filter((g) => g.cat === c).map((g) => C.gh[g.id].ex)), color: GOOD_CATS[c].color })), { stacked: true, fmt: (v) => nf(v), labels: lab });
    if (k === 'tr_catidx') lineChart(cv, CAT_ORDER.filter((c) => c !== 'services').map((c) => { const gs = GOODS.filter((g) => g.cat === c); const arr = sumSeries(gs.map((g) => G.goods[g.id].hist.map((v) => v / g.base * 100 / gs.length))); return { name: GOOD_CATS[c].name.split(' ')[0], data: arr, color: GOOD_CATS[c].color }; }), { fmt: (v) => nf(v), labels: lab });
    if (k === 'g_price') lineChart(cv, [{ name: GOOD[gid].name, data: G.goods[gid].hist, color: GOOD_CATS[GOOD[gid].cat].color, fill: true }], { fmt: (v) => nf(v, v < 10 ? 2 : 0), labels: lab, height: 170 });
    if (k === 'g_mine') { const gh = C.gh[gid]; lineChart(cv, [{ name: 'Производство', data: gh.prod, color: '#43c37a' }, { name: 'Потребление', data: gh.dem, color: '#ef5a4f' }, { name: 'Экспорт', data: gh.ex, color: '#e8b64a' }, { name: 'Импорт', data: gh.im, color: '#4c8dff' }], { fmt: (v) => nf(v, 1), labels: lab }); }
    if (k === 'g_world') lineChart(cv, [{ name: 'Мировое производство', data: G.goods[gid].wprod, color: '#43c37a' }, { name: 'Мировая торговля', data: G.goods[gid].vol, color: '#e8b64a' }], { fmt: (v) => nf(v), zero: true, labels: lab });
    if (k === 'p_bi') lineChart(cv, [{ name: 'Наш экспорт', data: C.ph[cid]?.ex || [], color: '#e8b64a' }, { name: 'Наш импорт', data: C.ph[cid]?.im || [], color: '#4c8dff' }], { fmt: (v) => nf(v, 1), zero: true, labels: lab });
    if (k === 'p_gdp') { const X = G.countries[cid]; lineChart(cv, [{ name: 'ВВП', data: X.hist.gdp, color: X.color, fill: true }], { fmt: (v) => nf(v), labels: lab }); }
    if (k === 'w_gdp') lineChart(cv, alive(G).map((X) => ({ name: X.short, data: X.hist.gdp, color: X.color })), { fmt: (v) => nf(v), labels: lab });
    if (k === 'w_trade') lineChart(cv, CAT_ORDER.map((c) => ({ name: GOOD_CATS[c].name.split(' ')[0], data: sumSeries(GOODS.filter((g) => g.cat === c).map((g) => G.goods[g.id].vol)), color: GOOD_CATS[c].color })), { stacked: true, fmt: (v) => nf(v), labels: lab });
    if (k === 'debt') lineChart(cv, [{ name: 'Долг', data: h.debt.map((v) => v * 100), color: '#f2994a' }, { name: 'Дефицит', data: h.deficit.map((v) => v * 100), color: '#9aa4b2' }], { fmt: (v) => nf(v) + '%', zero: true, labels: dateLbl });
  }
}

// ---------- обработчики ----------
function setPath(obj, path, v) { const ks = path.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks.at(-1)] = v; }
function onPanelInput(e) {
  const k = e.target.dataset.k; if (!k || e.target.type !== 'range') return;
  const C = P(), v = +e.target.value;
  if (k === 'rate' || k === 'printing') C.eco[k] = v; else if (k.startsWith('tp.')) setPath(C, k, v); else setPath(C.eco, k, v);
  const show = document.querySelector(`[data-show="${k}"]`);
  if (show) show.textContent = k.startsWith('spend.') ? pct(v, 1) + ' · ' + bn(v * C.eco.gdp) : k === 'printing' ? pct(v) + ' ВВП/год' : k.startsWith('tp.') ? pct(v, 0) : pct(v, k === 'rate' ? 2 : 1);
  const bs = $('#bsum'); if (bs) bs.innerHTML = budgetSummary(C);
}
function onPanelChange(e) {
  const k = e.target.dataset.k; const C = P();
  if (k === 'autoRate') { C.eco.autoRate = e.target.checked; renderTab(); }
  if (k && k.startsWith('tp.') && e.target.type === 'checkbox') {
    const [, kind, key] = k.match(/^tp\.(\w+)\.(.+)$/);
    if (e.target.checked) C.tp[kind][key] = true; else delete C.tp[kind][key];
    if (kind === 'ban' && e.target.checked) { const g = GOOD[key]; if (g.cat === 'agri' || key === 'food') addGroupMod(C, 'farmers', -6, 12); else addGroupMod(C, 'business', -4, 12); log(G, `Запрет экспорта: ${g.name}.`, 'law'); }
    if (kind === 'emb') { const [gid, cid] = key.split('>'); const d = e.target.checked ? -6 : 3; G.rel[cid][G.player] = Math.max(-100, Math.min(100, G.rel[cid][G.player] + d)); if (e.target.checked) log(G, `Эмбарго на ${GOOD[gid].name.toLowerCase()} против ${G.countries[cid].short}.`, 'diplo'); }
    toast('Торговая политика изменена — эффект со следующего месяца', 'good');
    renderTab();
  }
  if (k && k.startsWith('tp.') && e.target.type === 'range') renderTab();
  if (k === 'mobilized') {
    C.mil.mobilized = e.target.checked;
    if (C.mil.mobilized) { addGroupMod(C, 'workers', -6, 12); addGroupMod(C, 'youth', -10, 12); addGroupMod(C, 'siloviki', 6, 12); log(G, 'Объявлена мобилизация.', 'war'); }
    renderTab();
  }
  if (e.target.type === 'range') renderHeader();
}
function onPanelClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const C = P(), id = b.dataset.id, act = b.dataset.act;
  let r = null;
  switch (act) {
    case 'lawcat': lawCat = id; break;
    case 'good': tradeView = { v: 'good', id }; tab = 'trade'; $('#panel').scrollTop = 0; break;
    case 'good_go': tradeView = { v: 'good', id }; tab = 'trade'; $('#panel').scrollTop = 0; break;
    case 'partner': if (id === G.player) break; tradeView = { v: 'partner', id }; tab = 'trade'; map.select(id); $('#panel').scrollTop = 0; break;
    case 'tback': tradeView = { v: 'list' }; map.select(null); break;
    case 'tab_trade': tab = 'trade'; tradeView = { v: 'list' }; break;
    case 'tcat': tradeCat = id; break;
    case 'tsort': tradeSort = { k: id, d: tradeSort.k === id ? -tradeSort.d : -1 }; break;
    case 'tpreset': delete C.tp.tariff[id]; break;
    case 'pass': r = passLaw(G, C, id); break;
    case 'pass_lobby': r = passLaw(G, C, id, { lobby: true }); break;
    case 'repeal': r = repealLaw(G, C, id); break;
    case 'repeal_lobby': r = repealLaw(G, C, id, { lobby: true }); break;
    case 'selc': selC = id; map.select(id); break;
    case 'selc_go': if (id !== G.player) { selC = id; tab = 'diplomacy'; map.select(id); } break;
    case 'diplo': if (id === 'war' && !confirm(`Объявить войну ${G.countries[selC].name}?`)) return; r = doAction(G, G.player, selC, id); break;
    case 'peace': r = doAction(G, G.player, id, b.dataset.t); break;
    case 'bloc': r = joinBloc(G, G.player, id); break;
    case 'fxint': {
      if (C.eco.reserves < C.eco.gdp * 0.03) { r = { ok: false, msg: 'Недостаточно резервов' }; break; }
      C.eco.reserves -= C.eco.gdp * 0.03; C.eco.fxPush = -0.35; r = { ok: true, msg: 'ЦБ продаёт валюту' }; break;
    }
    case 'decree': r = decree(C, id); break;
  }
  if (r) toast(r.msg || (r.ok ? 'Готово' : 'Невозможно'), r.ok ? 'good' : 'bad');
  renderHeader(); renderTab(); map.update();
  if (G.gameOver) showGameOver();
}

function decree(C, id) {
  const pol = C.pol;
  const spend = (pc) => { if (pol.pc < pc) return false; pol.pc -= pc; return true; };
  if (id === 'propaganda') { if (!spend(10)) return { ok: false, msg: 'Нужно 10 ПК' }; for (const g in GROUPS) addGroupMod(C, g, 4, 6); return { ok: true, msg: 'Кампания запущена' }; }
  if (id === 'reshuffle') { if (!spend(25)) return { ok: false, msg: 'Нужно 25 ПК' }; pol.termMonths = Math.max(0, pol.termMonths - 60); pol.gmods = pol.gmods.filter((m) => m.v > 0); log(G, 'Правительство отправлено в отставку. Новые лица в кабинете.', 'law'); return { ok: true, msg: 'Новый кабинет сформирован' }; }
  if (id === 'snap') { if (!spend(15)) return { ok: false, msg: 'Нужно 15 ПК' }; election(G, C); return { ok: true, msg: 'Досрочные выборы проведены' }; }
  if (id.startsWith('pay_')) { const g = id.slice(4); if (!spend(6)) return { ok: false, msg: 'Нужно 6 ПК' }; C.eco.debt += C.eco.gdp * 0.003; addGroupMod(C, g, 12, 12); return { ok: true, msg: `Программа для группы «${GROUPS[g].name}» запущена` }; }
}

function onProvClick(p) {
  if (tab === 'trade') { if (p.owner === G.player) { tradeView = { v: 'list' }; map.select(null); } else { tradeView = { v: 'partner', id: p.owner }; map.select(p.owner); } renderTab(); return; }
  if (p.owner === G.player) { tab = 'overview'; map.select(null); }
  else { selC = p.owner; tab = 'diplomacy'; map.select(p.owner); }
  renderTab();
}
const TERR = { plain: 'Равнина', forest: 'Леса', mountain: 'Горы', desert: 'Пустыня', tundra: 'Тундра' };
function onHover(p, ev) {
  const t = $('#tip');
  if (!p) { t.hidden = true; return; }
  const C = G.countries[p.owner], ctrl = G.countries[p.ctrl];
  const RN = { oil: 'нефть', gas: 'газ', coal: 'уголь', iron: 'руда', copper: 'медь', rare: 'редкоземы', timber: 'лес' };
  const res = Object.keys(RN).filter((k) => (p.res[k] || 0) > 0.05).map((k) => RN[k]).join(', ');
  t.innerHTML = `<b>${C.short}</b>${p.capital ? ' ★ столица' : ''}<br>${TERR[p.terrain]}${res ? ' · ' + res : ''}${p.ctrl !== p.owner ? `<br><span class="bad">Оккупировано: ${ctrl.short}</span>` : ''}${p.core !== p.owner ? `<br><small>Исторически: ${G.countries[p.core].short}</small>` : ''}${p.owner !== G.player ? `<br>Отношения: ${nf(G.rel[G.player][p.owner])}` : ''}`;
  t.hidden = false;
  const r = $('#mapwrap').getBoundingClientRect();
  t.style.left = Math.min(ev.clientX - r.left + 14, r.width - 180) + 'px'; t.style.top = (ev.clientY - r.top + 14) + 'px';
}

// ---------- модальные окна ----------
function showEvent() {
  const ev = G.pendingEvents[0]; const m = $('#modal');
  if (!ev) { m.hidden = true; return; }
  setSpeed(0);
  const E = EVENTS[ev.id], C = P();
  m.innerHTML = `<div class="mbox"><div class="mkicker">${E.global ? 'Мировое событие' : ev.id === 'proposal' || ev.id === 'peace_offer' ? 'Дипломатия' : ev.id === 'war_declared' ? 'ВОЙНА' : 'Донесение'} · ${dateStr(G)}</div><h2>${E.title(G, C, ev)}</h2><p>${E.text(G, C, ev)}</p>
    <div class="mchoices">${E.choices.map((c, i) => `<button class="btn" data-ch="${i}"><b>${c.t}</b>${c.hint ? `<small>${c.hint}</small>` : ''}</button>`).join('')}</div></div>`;
  m.hidden = false;
  m.onclick = (e) => { const b = e.target.closest('[data-ch]'); if (!b) return; resolveEvent(G, ev, +b.dataset.ch); renderAll(); };
}

function showGameOver() {
  setSpeed(0);
  const C = P(), e = C.eco, g = G.gameOver;
  const m = $('#modal');
  m.innerHTML = `<div class="mbox over"><div class="mkicker">${g.win ? 'Финал' : 'Конец правления'} · ${dateStr(G)}</div><h2>${g.win ? 'История подвела итог' : 'Вы потеряли власть'}</h2><p>${g.text}</p>
    <div class="kv"><div><span>Лет у власти</span><b>${nf(G.turn / 12, 1)}</b></div><div><span>ВВП на душу</span><b>${nf(e.gdppc0 * 1000)} → ${nf(e.gdp / C.pop * 1000)} $</b></div>
    <div><span>Провинций</span><b>${G.provs.filter((p) => p.land && p.owner === C.id).length}</b></div><div><span>Итоговый счёт</span><b class="gold">${nf(g.score)}</b></div></div>
    <div class="mchoices"><button class="btn" onclick="location.reload()">Новая игра</button><button class="btn ghost" id="keepLook">Посмотреть на мир</button></div></div>`;
  m.hidden = false;
  m.onclick = (ev) => { if (ev.target.id === 'keepLook') m.hidden = true; };
}

let toastT;
function toast(msg, kind = '') {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + kind;
  clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), 2600);
}

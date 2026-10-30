// ===== Интерфейс «Державы» =====
import { COUNTRIES, PARTIES, GROUPS, GOV, BLOCS, LAWS, LAW_BY_ID, LAW_CATS, END_YEAR } from './data.js';
import { GOODS, GOOD, GOOD_CATS, IO, USED_IN } from './goods.js';
import { createWorld } from './world.js';
import { tariffOf } from './trade.js';
import {
  step, dateStr, budget, lawMods, lawVote, lawAvailable, passLaw, repealLaw, strength, wars, atWar, hasTreaty, sanctioned,
  groupTargets, addGroupMod, election, log, alive, score, borders,
} from './sim.js';
import { ACTIONS, canDo, doAction, joinBloc } from './diplo.js';
import { EVENTS, resolveEvent } from './events.js';
import { MapView } from './map.js';
import { lineChart, spark, hbars } from './charts.js';
import { seedRng, getRng } from './rng.js';
import { api } from './api.js';

// ---------- состояние ----------
let G = null, map = null, user = null, timer = null, speed = 0;
let sec = 'summary';
const subOf = {};
let detail = null;           // { kind: 'good'|'partner', id, tab }
let selC = null, lawCat = 'econ', goodCat = 'all', goodSort = { k: 'ex', d: -1 }, logFilter = 'all';
let saving = false, inboxOpen = false;
const pref = { pauseCrit: localStorage.getItem('dz_pause_crit') !== '0' };
const $ = (s, r = document) => r.querySelector(s);
const P = () => G.countries[G.player];

// ---------- форматирование ----------
const nf = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const bn = (x) => (Math.abs(x) >= 1000 ? nf(x / 1000, 2) + ' трлн $' : nf(x, Math.abs(x) < 10 ? 1 : 0) + ' млрд $');
const pct = (x, d = 1) => nf(x * 100, d) + '%';
const spct = (x, d = 1) => (x > 0 ? '+' : '') + nf(x * 100, d) + '%';
const cls = (good) => (good ? 'good' : 'bad');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const barColor = (v) => (v < 30 ? '#c0392b' : v < 50 ? '#d68910' : v < 70 ? '#9aa83a' : '#2e9d5b');
const bar = (v, color) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${color || barColor(v)}"></i></div>`;
const kpi = (l, v, s = '') => `<div class="kpi"><span>${l}</span><b>${v}</b><small>${s}</small></div>`;
const card = (title, body, extra = '') => `<div class="card"><h4>${title}${extra ? `<small>${extra}</small>` : ''}</h4>${body}</div>`;
const chart = (id, attrs = '') => `<canvas data-chart="${id}" ${attrs}></canvas>`;
const slider = (k, label, v, min, max, st, shown, dis = false, hint = '') =>
  `<div class="sl ${dis ? 'dis' : ''}"><div class="sl-h"><span>${label}</span><b data-show="${k}">${shown}</b></div><input type="range" data-k="${k}" min="${min}" max="${max}" step="${st}" value="${v}" ${dis ? 'disabled' : ''}>${hint ? `<small>${hint}</small>` : ''}</div>`;
const flagOf = (id) => `<span class="flag" style="background:${G.countries[id].color}"></span>`;
const relTag = (v) => `<span class="rel ${v > 5 ? 'p' : v < -5 ? 'n' : 'z'}">${v > 0 ? '+' : ''}${nf(v)}</span>`;
const MONTHS_S = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const dateLbl = (i, n) => { const back = n - 1 - i; let m = G.month - 1 - back, y = G.year; while (m < 0) { m += 12; y--; } return MONTHS_S[m] + ' ' + y; };

const ICONS = {
  summary: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  economy: '<path d="M4 20h16"/><path d="M6 15l4-4 3 3 6-7"/><path d="M15 7h4v4"/>',
  finance: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16 15h2"/>',
  trade: '<path d="M4 8h14l-3-3"/><path d="M20 16H6l3 3"/>',
  society: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 5.5a2.5 2.5 0 0 1 0 5"/><path d="M21 20c0-2.5-1.4-4.2-4-4.7"/>',
  politics: '<path d="M3 21h18"/><path d="M5 21V10M9 21V10M15 21V10M19 21V10"/><path d="M2 10l10-6 10 6z"/>',
  foreign: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3.5 3.5 3.5 14.5 0 18M12 3c-3.5 3.5-3.5 14.5 0 18"/>',
  world: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
};
const SECTIONS = [
  { id: 'summary', name: 'Сводка', subs: [['main', 'Главное'], ['log', 'Хроника']] },
  { id: 'economy', name: 'Экономика', subs: [['overview', 'Обзор'], ['sectors', 'Отрасли'], ['money', 'Деньги и цены']] },
  { id: 'finance', name: 'Бюджет', subs: [['summary', 'Итоги'], ['taxes', 'Налоги'], ['spend', 'Расходы']] },
  { id: 'trade', name: 'Торговля', subs: [['overview', 'Обзор'], ['goods', 'Товары'], ['partners', 'Партнёры']] },
  { id: 'society', name: 'Общество', subs: [['groups', 'Группы'], ['dev', 'Развитие']] },
  { id: 'politics', name: 'Политика', subs: [['parl', 'Парламент'], ['laws', 'Законы'], ['decrees', 'Указы']] },
  { id: 'foreign', name: 'Внешняя', subs: [['countries', 'Страны'], ['blocs', 'Блоки'], ['army', 'Армия и войны']] },
  { id: 'world', name: 'Мир', subs: [['rank', 'Рейтинг'], ['charts', 'Графики']] },
];
const SEC = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
const sub = () => subOf[sec] || SEC[sec].subs[0][0];

const DESC = {
  borea: 'Огромная сырьевая держава севера. Нефть, газ и лес кормят бюджет, но коррупция и санкционный риск тянут вниз.',
  valdia: 'Индустриальное сердце Запада: станки и автомобили. Богатая стареющая демократия с высокими налогами.',
  aurelia: 'Финансовый центр мира. Услуги, большой госдолг и дефицит торгового баланса.',
  ostmark: 'Маленькая технологическая республика: чипы и станки. Очень богата, но армия символическая, а сосед — Борея.',
  xandria: 'Многолюдная индустриальная автократия — фабрика электроники и редкоземельных металлов.',
  kargas: 'Нефтяной эмират в пустыне. Бюджет полностью зависит от цен на нефть.',
  zarakhan: 'Газовый султанат с химической промышленностью и амбициями региональной державы.',
  mirena: 'Бедная аграрная демократия: текстиль и продукты. Молодое население и огромный потенциал.',
  liorna: 'Страна «среднего пути» в центре континента: машиностроение и сталь, гибридный режим.',
  tarvania: 'Нищая, но богатая металлами диктатура. Хрупкая стабильность и агрессивная элита.',
};
const DIFF = { valdia: 'лёгкая', aurelia: 'средняя', ostmark: 'средняя', borea: 'средняя', xandria: 'средняя', kargas: 'средняя', zarakhan: 'сложная', mirena: 'сложная', liorna: 'средняя', tarvania: 'очень сложная' };

// =================== ЭКРАНЫ ВНЕ ИГРЫ ===================
export async function boot() {
  try { user = (await api.me()).user; showMenu(); } catch { showAuth(); }
}

function showScreen(html) {
  stopTimer(); $('#game').hidden = true; const s = $('#screen'); s.hidden = false; s.innerHTML = html; window.scrollTo(0, 0);
}
const brand = `<div class="brandbig"><div class="logo"></div><h1>ДЕРЖАВА</h1></div>`;

function showAuth(mode = 'login', errMsg = '') {
  showScreen(`<div><div style="text-align:center">${brand.replace('brandbig', 'brandbig" style="justify-content:center')}<p class="sub">Геополитическая стратегия · ${COUNTRIES.length} государств · 2030–${END_YEAR}</p></div>
    <form class="authbox" id="authf">
      <div class="seg"><button type="button" data-m="login" class="${mode === 'login' ? 'on' : ''}">Вход</button><button type="button" data-m="register" class="${mode === 'register' ? 'on' : ''}">Регистрация</button></div>
      ${errMsg ? `<div class="formerr">${esc(errMsg)}</div>` : ''}
      <label class="fld"><span>Почта</span><input class="input" name="email" type="email" autocomplete="email" required></label>
      ${mode === 'register' ? '<label class="fld"><span>Имя в игре <span class="muted">(необязательно)</span></span><input class="input" name="nick" maxlength="24"></label>' : ''}
      <label class="fld"><span>Пароль</span><input class="input" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="6" required></label>
      <button class="btn primary" style="width:100%;height:38px;justify-content:center" type="submit">${mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
      <p class="mini" style="text-align:center;margin-top:12px">Прогресс сохраняется на сервере — играйте с любого устройства.</p>
    </form></div>`);
  $('#authf').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) showAuth(b.dataset.m); };
  $('#authf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      user = (mode === 'login' ? await api.login(f.get('email'), f.get('password')) : await api.register(f.get('email'), f.get('password'), f.get('nick'))).user;
      showMenu();
    } catch (er) { showAuth(mode, er.message); }
  };
}

const SLOT_NAMES = { auto: 'Автосохранение', s1: 'Слот 1', s2: 'Слот 2', s3: 'Слот 3', s4: 'Слот 4', s5: 'Слот 5' };
const fmtTime = (t) => new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function showMenu() {
  showScreen(`<div class="menuwrap"><div class="menuhead"><div>${brand}<p class="sub">Здравствуйте, <b>${esc(user.nickname)}</b> · ${esc(user.email)}</p></div><button class="btn" id="logout">Выйти</button></div>
    <div class="menugrid"><div class="panel"><div class="between"><h3>Сохранения</h3><button class="btn primary" id="newgame">Новая игра</button></div><div id="slots"><p class="muted">Загрузка…</p></div></div>
    <div class="panel"><h3>Зал славы</h3><div id="lb"><p class="muted">Загрузка…</p></div></div></div></div>`);
  $('#logout').onclick = async () => { await api.logout().catch(() => {}); user = null; showAuth(); };
  $('#newgame').onclick = showPick;
  try {
    const { saves } = await api.saves();
    $('#slots').innerHTML = saves.length ? saves.map((s) => `<div class="slot"><div><b>${SLOT_NAMES[s.slot]}</b> · ${esc(s.country)} · ${esc(s.game_date)}<small>${fmtTime(s.updated_at)}${s.name ? ' · ' + esc(s.name) : ''}</small></div>
      <div class="row" style="margin:0"><button class="btn primary sm" data-load="${s.slot}">Играть</button><button class="btn sm danger" data-del="${s.slot}">Удалить</button></div></div>`).join('')
      : '<p class="muted">Сохранений пока нет. Начните новую игру — прогресс будет сохраняться автоматически.</p>';
    $('#slots').onclick = async (e) => {
      const l = e.target.closest('[data-load]'), d = e.target.closest('[data-del]');
      if (l) loadSlot(l.dataset.load);
      if (d && confirm('Удалить сохранение?')) { await api.del(d.dataset.del); showMenu(); }
    };
  } catch (e) { $('#slots').innerHTML = `<p class="bad">${esc(e.message)}</p>`; }
  try {
    const { results } = await api.leaderboard();
    $('#lb').innerHTML = results.length ? `<table class="lb">${results.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.nickname)}<br><small class="muted">${esc(r.country)} · ${nf(r.years, 1)} лет</small></td><td>${nf(r.score)}</td></tr>`).join('')}</table>` : '<p class="muted">Пока пусто — станьте первым.</p>';
  } catch { $('#lb').innerHTML = ''; }
}

function showPick() {
  showScreen(`<div class="menuwrap" style="width:1100px"><div class="menuhead"><div><h2 style="margin:0 0 4px;font-size:20px">Выберите государство</h2><p class="sub" style="margin:0">У каждой страны своя экономика, ресурсы, режим и соседи</p></div>
    <div class="row"><label class="muted">Агрессивность ИИ <select id="diff"><option value="easy">мирный мир</option><option value="normal" selected>обычная</option><option value="hard">жестокий мир</option></select></label><button class="btn" id="back">Назад</button></div></div>
    <div class="cards">${COUNTRIES.map((c) => `<button class="ccard" data-start="${c.id}" style="--cc:${c.color}"><h4>${c.name}</h4><p>${DESC[c.id]}</p>
      <div class="meta"><span class="pill">${GOV[c.gov].name}</span><span class="pill">${c.pop} млн чел.</span><span class="pill">${c.gdppc} тыс. $ на душу</span><span class="pill ${DIFF[c.id].includes('слож') ? 'warn' : DIFF[c.id] === 'лёгкая' ? 'good' : ''}">${DIFF[c.id]}</span></div></button>`).join('')}</div></div>`);
  $('#back').onclick = showMenu;
  $('#screen').onclick = (e) => {
    const b = e.target.closest('[data-start]'); if (!b) return;
    G = createWorld(b.dataset.start, { difficulty: $('#diff').value });
    log(G, `Вы возглавили государство ${P().name}.`, 'good');
    $('#screen').onclick = null;
    startGame();
    autosave(true);
  };
}

async function loadSlot(slot) {
  try {
    const data = await api.load(slot);
    if (data.version !== 2) { alert('Это сохранение от старой версии игры и несовместимо.'); return; }
    G = data; seedRng(G.rngState || 1); G._borders = null;
    $('#screen').onclick = null;
    startGame();
    toast('Игра загружена');
  } catch (e) { alert(e.message); }
}

function snapshot() { G.rngState = getRng(); const { _borders, ...rest } = G; return rest; }
async function saveSlot(slot, quiet) {
  if (saving) return; saving = true; updateSaving();
  try {
    await api.save(slot, { name: '', country: P().short, gameDate: dateStr(G), score: score(G, P()) }, snapshot());
    if (!quiet) toast('Сохранено: ' + SLOT_NAMES[slot], 'good');
  } catch (e) { toast('Не удалось сохранить: ' + e.message, 'bad'); }
  saving = false; updateSaving();
}
function autosave(force) { if (force || G.turn % 3 === 0) saveSlot('auto', true); }
function updateSaving() { const el = $('#saving'); if (el) el.textContent = saving ? 'сохранение…' : ''; }

// =================== ИГРОВОЙ ЭКРАН ===================
function startGame() {
  $('#screen').hidden = true; $('#game').hidden = false;
  sec = 'summary'; detail = null; inboxOpen = false;
  $('#drawer').hidden = true;
  if (!map) {
    map = new MapView($('#map'), onProvClick, onHover);
    $('#mapmodes').onclick = (e) => { const b = e.target.closest('[data-mode]'); if (b) { map.setMode(b.dataset.mode); renderLegend(); markModes(); } };
    $('#zoomctl').onclick = (e) => { const b = e.target.closest('[data-z]'); if (!b) return; if (b.dataset.z === '0') map.reset(); else map.zoom(b.dataset.z === '+' ? 1 / 1.3 : 1.3); };
    $('#rail').onclick = (e) => { const b = e.target.closest('[data-sec]'); if (b) go(b.dataset.sec); };
    $('#subtabs').onclick = (e) => { const b = e.target.closest('[data-sub]'); if (b) { subOf[sec] = b.dataset.sub; detail = null; renderContent(); } };
    $('#cbody').onclick = onClick; $('#cbody').oninput = onInput; $('#cbody').onchange = onChange;
    $('#clock').onclick = (e) => { const b = e.target.closest('[data-speed]'); if (b) setSpeed(+b.dataset.speed); if (e.target.closest('#nextbtn')) nextTurn(); };
    $('#tools').onclick = (e) => { const b = e.target.closest('[data-tool]'); if (b) tool(b.dataset.tool); };
    $('#drawer').onclick = onInboxClick;
    document.addEventListener('keydown', (e) => {
      if ($('#game').hidden || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); setSpeed(speed ? 0 : 1); }
      if (e.key === 'Enter') nextTurn();
    });
  }
  map.build(G); map.reset(); map.mode = 'political'; markModes(); renderLegend();
  $('#rail').innerHTML = SECTIONS.map((s) => `<button data-sec="${s.id}"><svg viewBox="0 0 24 24">${ICONS[s.id]}</svg>${s.name}</button>`).join('');
  setSpeed(0);
  renderAll();
}

function go(s, subId, det = null) { sec = s; if (subId) subOf[s] = subId; detail = det; renderContent(); $('#cbody').scrollTop = 0; }
function markModes() { for (const x of $('#mapmodes').querySelectorAll('[data-mode]')) x.classList.toggle('on', x.dataset.mode === map.mode); }

function setSpeed(s) {
  speed = s; stopTimer();
  if (s) timer = setInterval(() => nextTurn(true), { 1: 4000, 2: 2000, 3: 1000 }[s]);
  for (const b of document.querySelectorAll('[data-speed]')) b.classList.toggle('on', +b.dataset.speed === s);
}
function stopTimer() { clearInterval(timer); timer = null; }

function nextTurn(auto = false) {
  if (!G || G.gameOver) return;
  // нерешённые донесения старше 3 месяцев решаются по умолчанию
  for (const ev of [...G.pendingEvents]) if (G.turn - (ev.t ?? G.turn) >= 3) {
    const E = EVENTS[ev.id]; const di = E.def ?? E.choices.length - 1;
    resolveEvent(G, ev, di); log(G, `Решение по донесению «${E.title(G, P(), ev)}» принято аппаратом: «${E.choices[di].t}».`, 'info');
  }
  const before = new Set(G.pendingEvents);
  step(G);
  let crit = false;
  for (const ev of G.pendingEvents) if (!before.has(ev)) {
    ev.t = G.turn;
    const E = EVENTS[ev.id];
    toast('Новое донесение: ' + E.title(G, P(), ev));
    if (ev.id === 'war_declared') crit = true;
  }
  autosave();
  if (crit && pref.pauseCrit) { setSpeed(0); openInbox(true); }
  renderAll();
  if (G.gameOver) gameOver();
}

function renderAll() { renderHeader(); renderContent(); map.update(); renderInbox(); }

function renderHeader() {
  const C = P(), e = C.eco, pol = C.pol;
  $('#who').innerHTML = `<span class="flag lg" style="background:${C.color}"></span><div><b>${C.short}</b><small>${GOV[C.gov].name} · ${PARTIES[C.party].short}</small></div>`;
  $('#date').textContent = dateStr(G);
  const ch = (h, k, inv = false) => { if (h.length < 13) return ''; const d = h[h.length - 1] - h[h.length - 13]; const good = inv ? d < 0 : d > 0; return `<em class="${Math.abs(d) < 1e-9 ? 'muted' : cls(good)}">${d > 0 ? '▲' : '▼'}</em>`; };
  const ind = (l, v, good, extra = '', title = '') => `<div class="ind" title="${title}"><span>${l}</span><b class="${good === undefined ? '' : cls(good)}">${v}</b>${extra}</div>`;
  $('#inds').innerHTML = [
    ind('ВВП', bn(e.gdp), undefined, ch(C.hist.gdp)),
    ind('Рост', spct(e.growth), e.growth > 0.01),
    ind('Инфляция', pct(e.infl), e.infl < 0.06 && e.infl > -0.005),
    ind('Безработица', pct(e.unemp), e.unemp < 0.07),
    ind('Госдолг', pct(e.debt / e.gdp, 0), e.debt / e.gdp < 0.8),
    ind('Одобрение', nf(pol.approval), pol.approval > 45, ch(C.hist.approval)),
    ind('Стабильность', nf(pol.stability), pol.stability > 40),
    ind('Политкапитал', nf(pol.pc), undefined, '', 'Тратится на законы, дипломатию и указы'),
  ].join('');
  const n = G.pendingEvents.length;
  $('#inboxcount').hidden = !n; $('#inboxcount').textContent = n;
}

function renderContent() {
  for (const b of $('#rail').children) b.classList.toggle('on', b.dataset.sec === sec);
  const S = SEC[sec];
  $('#ctitle').textContent = S.name;
  $('#subtabs').innerHTML = S.subs.map(([id, n]) => `<button data-sub="${id}" class="${id === sub() ? 'on' : ''}">${n}</button>`).join('');
  const fn = VIEWS[sec + '.' + sub()];
  const sc = $('#cbody').scrollTop;
  $('#cbody').innerHTML = detail ? (detail.kind === 'good' ? goodView() : partnerView()) : fn();
  $('#cbody').scrollTop = sc;
  drawCharts();
  syncMap();
}

// =================== СВОДКА ===================
function advisors(C) {
  const e = C.eco, pol = C.pol, out = [];
  const add = (lvl, who, t) => out.push({ lvl, who, t });
  if (e.infl > 0.1) add('bad', 'Центробанк', `Инфляция ${pct(e.infl)}. ${e.autoRate || lawMods(C).rateRule ? 'Ставка растёт автоматически, но дефицит и эмиссия разгоняют цены.' : 'Поднимите ключевую ставку или включите автопилот.'}`);
  if (e.printing > 0.01) add('bad', 'Минфин', `Эмиссия ${pct(e.printing)} ВВП в год — прямой путь к инфляции.`);
  if (e.infl < 0) add('warn', 'Центробанк', 'Дефляция: снижайте ставку и стимулируйте спрос.');
  if (e.unemp > 0.1) add('bad', 'Минтруд', `Безработица ${pct(e.unemp)}. Нужен стимул или реформа рынка труда.`);
  if (e.budget.deficitGdp > 0.05) add('warn', 'Минфин', `Дефицит бюджета ${pct(e.budget.deficitGdp)} ВВП — долг и ставки по нему растут.`);
  if (e.debt / e.gdp > 1.1) add('bad', 'Минфин', `Госдолг ${pct(e.debt / e.gdp, 0)} ВВП, рейтинг ${e.rating}. Риск долгового кризиса.`);
  const shorts = GOODS.filter((g) => C.gs[g.id].shortR > 0.08).map((g) => g.name.toLowerCase());
  if (shorts.length) add('warn', 'Минпромторг', `Дефицит на рынке: ${shorts.slice(0, 4).join(', ')}. Ищите поставщиков или снижайте пошлины.`);
  if (e.accessLoss > 0.1) add('warn', 'МИД', `Санкции и войны сократили доступ к рынкам на ${pct(e.accessLoss, 0)}.`);
  if (pol.stability < 35) add('bad', 'Спецслужбы', 'Стабильность критически низкая — возможны протесты и революция.');
  if ((pol.groups.siloviki ?? 50) < 30 && C.gov !== 'democracy') add('bad', 'Спецслужбы', 'Силовики недовольны. Риск переворота!');
  const every = GOV[C.gov].electionEvery;
  if (every && pol.nextElection <= 12) { const s = pol.support[C.party]; add(s > 0.3 ? 'info' : 'warn', 'Штаб партии', `Выборы через ${pol.nextElection} мес. Рейтинг партии ${pct(s, 0)}.`); }
  for (const w of wars(G, C.id)) { const my = w.sideA.includes(C.id) ? w.score : -w.score; add(my < 0 ? 'bad' : 'info', 'Генштаб', `Война с ${G.countries[w.sideA.includes(C.id) ? w.b : w.a].short}: ${my >= 0 ? 'перевес наш' : 'мы отступаем'}.`); }
  if (pol.pc > 120) add('info', 'Администрация', `Накоплено ${nf(pol.pc)} политкапитала — время для реформ.`);
  if (!out.length) add('good', 'Аппарат', 'Обстановка спокойная. Хорошее время для долгосрочных реформ.');
  return out;
}
const VIEWS = {};
VIEWS['summary.main'] = () => {
  const C = P(), pol = C.pol, every = GOV[C.gov].electionEvery;
  const ad = advisors(C).map((a) => `<div class="adv ${a.lvl}"><i></i><div><b>${a.who}</b>${a.t}</div></div>`).join('');
  const n = G.pendingEvents.length;
  return `<div class="kpis k4">${kpi('ВВП на душу', nf(C.eco.gdp / C.pop * 1000) + ' $', 'в 2030: ' + nf(C.eco.gdppc0 * 1000) + ' $')}${kpi('Торговый баланс', `<span class="${cls(C.eco.ex >= C.eco.im)}">${bn(C.eco.ex - C.eco.im)}</span>`, 'в год')}
    ${kpi('Выборы', every ? `через ${pol.nextElection} мес.` : 'нет', GOV[C.gov].name)}${kpi('Донесения', n ? `<a class="clink" data-act="inbox">${n} ждут решения</a>` : 'нет новых', 'решаются за 3 мес.')}</div>
    ${card('Доклады советников', ad)}
    <div class="grid2">${card('ВВП, млрд $', chart('gdp'))}${card('Одобрение и стабильность', chart('appr'))}</div>`;
};
VIEWS['summary.log'] = () => {
  const F = { all: 'Все', mine: 'Наши', war: 'Войны', diplo: 'Дипломатия', law: 'Законы', world: 'Мир' };
  const items = G.log.filter((l) => logFilter === 'all' || (logFilter === 'mine' ? (!l.who || l.who === G.player) && !['world'].includes(l.kind) : l.kind === logFilter));
  return `<div class="chips">${Object.entries(F).map(([k, n]) => `<button data-act="logf" data-id="${k}" class="${logFilter === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="card logs">${items.slice(0, 200).map((l) => `<div class="log ${l.kind}"><span>${l.d}</span><div>${esc(l.text)}</div></div>`).join('') || '<div class="empty">Пусто</div>'}</div>`;
};

// =================== ЭКОНОМИКА ===================
VIEWS['economy.overview'] = () => {
  const C = P(), e = C.eco;
  return `<div class="kpis">${kpi('ВВП', bn(e.gdp), spct(e.growth) + ' за год')}${kpi('ВВП на душу', nf(e.gdp / C.pop * 1000) + ' $', 'в 2030: ' + nf(e.gdppc0 * 1000) + ' $')}${kpi('Разрыв выпуска', spct(e.gap), e.gap > 0.02 ? 'перегрев' : e.gap < -0.02 ? 'спад' : 'норма')}
    ${kpi('Инвестиции', pct(e.investRate || 0.2), 'от ВВП')}${kpi('Доверие бизнеса', nf(e.conf), 'из 100')}${kpi('Неравенство', nf(e.gini, 2), 'индекс Джини')}</div>
    ${card('ВВП по отраслям, млрд $', chart('e_sect'))}
    <div class="grid2">${card('Рост ВВП год к году', chart('e_growth'))}${card('Безработица', chart('e_unemp'))}</div>`;
};
VIEWS['economy.sectors'] = () => {
  const C = P(), e = C.eco, T = C.trade;
  const tot = e.P.agri + e.P.industry + e.P.services + e.P.tech + e.miningOut;
  const util = { agri: T.agriIdx, industry: T.U.industry, services: T.U.services, tech: T.U.tech };
  const rows = [['agri', 'Сельское хозяйство'], ['industry', 'Промышленность'], ['tech', 'Высокие технологии'], ['services', 'Услуги']].map(([k, n]) =>
    `<tr><td>${n}</td><td class="num">${bn(e.P[k])}</td><td class="num">${pct(e.P[k] / tot)}</td><td class="num ${cls(e.sectorG?.[k] > 0.015)}">${spct(e.sectorG?.[k] || 0)}</td><td class="num ${cls(util[k] > 0.97)}">${pct(util[k], 0)}</td></tr>`).join('')
    + `<tr><td>Добыча сырья</td><td class="num">${bn(e.miningOut)}</td><td class="num">${pct(e.miningOut / tot)}</td><td class="num muted">по ценам</td><td class="num muted">—</td></tr>`;
  const sp = e.spend;
  return `${card('Отрасли', `<table class="tbl"><tr><th>Сектор</th><th class="num">Потенциал</th><th class="num">Доля</th><th class="num">Рост</th><th class="num">Загрузка</th></tr>${rows}</table><div class="mini">Загрузка падает, когда отрасли не хватает сырья (дефицит, санкции) или ей некуда продать продукцию.</div>`)}
    ${card('Отраслевые субсидии', slider('spend.subAgri', 'Сельское хозяйство', sp.subAgri, 0, 0.04, 0.001, pct(sp.subAgri) + ' ВВП') + slider('spend.subInd', 'Промышленность', sp.subInd, 0, 0.04, 0.001, pct(sp.subInd) + ' ВВП') + slider('spend.subTech', 'IT и хай-тек', sp.subTech, 0, 0.04, 0.001, pct(sp.subTech) + ' ВВП') + '<div class="mini">Субсидии ускоряют рост отрасли, но увеличивают расходы бюджета. Субсидии на отдельные товары — в разделе «Торговля».</div>')}`;
};
VIEWS['economy.money'] = () => {
  const C = P(), e = C.eco, M = lawMods(C);
  const manual = !(M.rateRule > 0) && !e.autoRate;
  return `<div class="kpis k4">${kpi('Ключевая ставка', pct(e.rate, 2), 'реальная ' + pct(e.rate - e.inflExp))}${kpi('Инфляция', pct(e.infl), 'ожидания ' + pct(e.inflExp))}${kpi('Курс валюты', nf(e.fx, 1), '100 = 2030, выше — слабее')}${kpi('Резервы', bn(e.reserves), 'ЗВР')}</div>
    ${card('Денежная политика', `<div class="row"><label><input type="checkbox" data-k="autoRate" ${e.autoRate ? 'checked' : ''} ${M.rateRule > 0 ? 'disabled' : ''}> Автопилот ставки по правилу Тейлора</label>${M.rateRule > 0 ? '<span class="pill blue">ЦБ независим</span>' : ''}</div>
      ${slider('rate', 'Ключевая ставка', e.rate, 0, 0.5, 0.0025, pct(e.rate, 2), !manual)}
      ${slider('printing', 'Денежная эмиссия на нужды бюджета', e.printing, 0, 0.1, 0.0025, pct(e.printing) + ' ВВП/год', false, 'Покрывает дефицит без долга, но разгоняет инфляцию')}
      <div class="row"><button class="btn" data-act="fxint">Валютная интервенция: −3% ВВП из резервов</button></div>`)}
    <div class="grid2">${card('Ставка и инфляция', chart('e_rate'))}${card('Курс и цены товарной корзины', chart('e_fx'))}</div>`;
};

// =================== БЮДЖЕТ ===================
const REV_N = { inc: 'НДФЛ', pay: 'Страховые взносы', corp: 'Налог на прибыль', vat: 'НДС', res: 'НДПИ / рента', tariff: 'Импортные пошлины', duty: 'Экспортные пошлины' };
const EXP_N = { social: 'Соцвыплаты', health: 'Здравоохранение', edu: 'Образование', infra: 'Инфраструктура', defense: 'Оборона', security: 'Безопасность', science: 'Наука', subsidies: 'Отраслевые субсидии', admin: 'Госаппарат', programs: 'Госпрограммы', tradeSub: 'Товарные субсидии', war: 'Военные операции', interest: 'Проценты по долгу' };
function budgetKpis(C) {
  const b = budget(G, C), e = C.eco; C.eco.budget = { ...C.eco.budget, ...b };
  return `<div class="kpis k4">${kpi(b.deficit > 0 ? 'Дефицит' : 'Профицит', `<span class="${cls(b.deficit <= 0.03 * e.gdp)}">${bn(Math.abs(b.deficit))}</span>`, pct(Math.abs(b.deficitGdp)) + ' ВВП')}${kpi('Доходы', bn(b.R), pct(b.revGdp) + ' ВВП')}${kpi('Расходы', bn(b.X), pct(b.X / e.gdp) + ' ВВП')}${kpi('Госдолг', `<span class="${cls(e.debt / e.gdp < 0.8)}">${pct(e.debt / e.gdp, 0)}</span>`, 'рейтинг ' + e.rating + ' · ' + pct(e.debtRate))}</div>`;
}
VIEWS['finance.summary'] = () => {
  const C = P(), b = budget(G, C);
  const rr = Object.entries(b.rev).filter(([, v]) => v > 0.01).sort((a, c) => c[1] - a[1]).map(([k, v]) => ({ label: REV_N[k], value: v, color: '#2e9d5b' }));
  const xr = Object.entries(b.exp).filter(([, v]) => v > 0.01).sort((a, c) => c[1] - a[1]).map(([k, v]) => ({ label: EXP_N[k], value: v, color: '#c0504d' }));
  return `<div id="bkpi">${budgetKpis(C)}</div>
    <div class="grid2">${card('Доходы и расходы, млрд $', chart('b_revexp'))}${card('Госдолг и дефицит, % ВВП', chart('debt'))}</div>
    <div class="grid2">${card('Структура доходов', hbars(rr, bn))}${card('Структура расходов', hbars(xr, bn))}</div>`;
};
const TAXES = [['inc', 'НДФЛ', 0.5, 'Не любят рабочие и бизнес'], ['pay', 'Страховые взносы', 0.5, 'Налог на фонд оплаты труда'], ['corp', 'Налог на прибыль', 0.5, 'Сильно бьёт по инвестициям'],
  ['vat', 'НДС', 0.3, 'Стабильный доход, давит на потребление'], ['res', 'НДПИ / рента', 0.8, 'Доля государства в выручке добычи'], ['tariff', 'Базовая импортная пошлина', 0.4, 'Для всех товаров без особой ставки']];
VIEWS['finance.taxes'] = () => {
  const C = P(), e = C.eco, b = budget(G, C);
  const revOf = { inc: b.rev.inc, pay: b.rev.pay, corp: b.rev.corp, vat: b.rev.vat, res: b.rev.res, tariff: b.rev.tariff };
  return `<div id="bkpi">${budgetKpis(C)}</div>${card('Налоговые ставки', TAXES.map(([k, n, ma, h]) => slider('tax.' + k, `${n} <span class="muted">· ${bn(revOf[k])}</span>`, e.tax[k] || 0, 0, ma, 0.005, pct(e.tax[k] || 0, 1), false, h)).join('') + `<div class="mini">Собираемость налогов: <b>${pct(b.compl, 0)}</b> — падает при высокой коррупции и чрезмерной нагрузке.</div>`)}`;
};
const SPEND = [['Социальная сфера', [['social', 'Соцвыплаты и пенсии', 0.3], ['health', 'Здравоохранение', 0.12], ['edu', 'Образование', 0.1]]],
  ['Развитие', [['infra', 'Инфраструктура', 0.1], ['science', 'Наука', 0.06]]],
  ['Безопасность', [['defense', 'Оборона', 0.12], ['security', 'Полиция и спецслужбы', 0.06]]]];
VIEWS['finance.spend'] = () => {
  const C = P(), e = C.eco;
  return `<div id="bkpi">${budgetKpis(C)}</div>${card('Расходы, % ВВП', SPEND.map(([g, items]) => `<div class="grp-title">${g}</div>` + items.map(([k, n, ma]) => slider('spend.' + k, n, e.spend[k], 0, ma, 0.001, pct(e.spend[k], 1) + ' · ' + bn(e.spend[k] * e.gdp))).join('')).join('')
    + '<div class="mini">Расходы на образование, медицину, инфраструктуру и науку меняют индексы развития постепенно, за годы. Отраслевые субсидии — в «Экономика → Отрасли».</div>')}`;
};

// =================== ТОРГОВЛЯ ===================
const CAT_ORDER = ['raw', 'agri', 'industry', 'tech', 'services'];
const gP = (gid) => G.goods[gid].p;
const priceStr = (gid) => { const v = gP(gid) * GOOD[gid].base; return (v >= 1000 ? nf(v, 0) : v >= 10 ? nf(v, 1) : nf(v, 2)) + ' ' + GOOD[gid].unit; };
const chg12 = (gid) => { const h = G.goods[gid].hist; return h.length > 12 ? h[h.length - 1] / h[h.length - 13] - 1 : (h.length ? h[h.length - 1] / GOOD[gid].base - 1 : 0); };
const cname = (id) => `<a class="clink" data-act="partner" data-id="${id}">${flagOf(id)}${G.countries[id].short}</a>`;
const glink = (gid) => `<a class="glink" data-act="good" data-id="${gid}">${GOOD[gid].icon} ${GOOD[gid].name}</a>`;
const sumSeries = (arrs) => { const n = Math.max(0, ...arrs.map((a) => a.length)); const out = Array(n).fill(0); for (const a of arrs) { const off = n - a.length; a.forEach((v, i) => (out[off + i] += v)); } return out; };

VIEWS['trade.overview'] = () => {
  const C = P(), T = C.trade, e = C.eco;
  const world = alive(G).reduce((s, X) => s + X.trade.ex, 0);
  let exP = 0, exW = 0, imP = 0, imW = 0;
  for (const g of GOODS) { const s = C.gs[g.id]; exP += s.ex * gP(g.id); exW += s.ex; imP += s.im * gP(g.id); imW += s.im; }
  const tot = exW && imW ? (exP / exW) / (imP / imW) : 1;
  const top = (by, color) => Object.entries(by).filter(([, v]) => v > 0.01).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([d, v]) => ({ label: `${flagOf(d)}${G.countries[d].short}`, value: v, color, act: 'partner', id: d }));
  const topG = (key, color) => GOODS.map((g) => ({ label: `${g.icon} ${g.name}`, value: T[key][g.id] || 0, color, act: 'good', id: g.id })).filter((r) => r.value > 0.01).sort((a, b) => b.value - a.value).slice(0, 6);
  return `<div class="kpis">${kpi('Экспорт', bn(T.ex), pct(T.ex / e.gdp) + ' ВВП')}${kpi('Импорт', bn(T.im), pct(T.im / e.gdp) + ' ВВП')}${kpi('Сальдо', `<span class="${cls(T.ex >= T.im)}">${bn(T.ex - T.im)}</span>`, spct((T.ex - T.im) / e.gdp) + ' ВВП')}
    ${kpi('Доля в мировом экспорте', pct(T.ex / Math.max(1, world)), 'мир: ' + bn(world))}${kpi('Условия торговли', nf(tot, 2), tot >= 1 ? 'экспорт дороже импорта' : 'импорт дороже экспорта')}${kpi('Базовая пошлина', pct(e.tax.tariff, 0), 'меняется в «Бюджет → Налоги»')}</div>
    ${card('Экспорт и импорт, млрд $ в год', chart('tr_exim'))}
    <div class="grid2">${card('Главный экспорт', hbars(topG('exG', '#1f5fbf'), bn))}${card('Главный импорт', hbars(topG('imG', '#d68910'), bn))}</div>
    <div class="grid2">${card('Куда продаём', hbars(top(T.exBy, '#1f5fbf'), bn))}${card('Откуда покупаем', hbars(top(T.imBy, '#d68910'), bn))}</div>`;
};
VIEWS['trade.goods'] = () => {
  const C = P();
  const chips = ['all', ...CAT_ORDER].map((c) => `<button data-act="gcat" data-id="${c}" class="${goodCat === c ? 'on' : ''}">${c === 'all' ? 'Все' : GOOD_CATS[c].name}</button>`).join('');
  let list = GOODS.filter((g) => goodCat === 'all' || g.cat === goodCat).map((g) => ({ g, s: C.gs[g.id] }));
  const key = { name: (r) => r.g.name, price: (r) => chg12(r.g.id), prod: (r) => r.s.prod * gP(r.g.id), ex: (r) => r.s.ex * gP(r.g.id), im: (r) => r.s.im * gP(r.g.id), self: (r) => r.s.prod / Math.max(1e-6, r.s.dem) }[goodSort.k];
  list.sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * goodSort.d; });
  const th = (k, n, num = true) => `<th data-act="gsort" data-id="${k}" class="sortable ${num ? 'num' : ''}">${n}${goodSort.k === k ? (goodSort.d > 0 ? ' ↑' : ' ↓') : ''}</th>`;
  const rows = list.map(({ g, s }) => {
    const pr = gP(g.id), self = s.prod / Math.max(1e-6, s.dem), c = chg12(g.id);
    const flags = [C.tp.ban[g.id] ? '<span class="tflag bad">запрет</span>' : '', C.tp.tariff[g.id] != null ? `<span class="tflag">пошл. ${pct(C.tp.tariff[g.id], 0)}</span>` : '', C.tp.sub[g.id] ? '<span class="tflag good">субс.</span>' : '', s.shortR > 0.05 ? `<span class="tflag bad">дефицит</span>` : ''].join('');
    return `<tr class="click" data-act="good" data-id="${g.id}"><td class="gname"><span class="gico">${g.icon}</span>${g.name}${flags}</td><td class="num">${priceStr(g.id)}<small class="${c >= 0 ? 'up' : 'down'}">${spct(c, 0)} за год</small></td><td class="num">${s.ex > 0.005 ? bn(s.ex * pr) : '<span class="muted">—</span>'}</td><td class="num">${s.im > 0.005 ? bn(s.im * pr) : '<span class="muted">—</span>'}</td>
      <td><div class="selfbar" title="Самообеспеченность ${pct(self, 0)}"><i style="width:${Math.min(100, self * 50)}%;background:${self >= 1 ? '#2e9d5b' : self > 0.6 ? '#d68910' : '#c0392b'}"></i><em></em></div></td></tr>`;
  }).join('');
  return `<div class="chips">${chips}</div><div class="card"><div class="tblwrap"><table class="tbl"><tr>${th('name', 'Товар', false)}${th('price', 'Цена')}${th('ex', 'Экспорт')}${th('im', 'Импорт')}${th('self', 'Обесп.', false)}</tr>${rows}</table></div>
    <div class="mini">Нажмите на товар — рынок, потоки, производственная цепочка и ваша политика по нему. Шкала обеспеченности: черта — 100% (своего хватает).</div></div>`;
};
VIEWS['trade.partners'] = () => {
  const C = P(), T = C.trade;
  const rows = alive(G).filter((X) => X.id !== G.player).map((X) => ({ X, ex: T.exBy[X.id] || 0, im: T.imBy[X.id] || 0 })).sort((a, b) => b.ex + b.im - a.ex - a.im).map(({ X, ex, im }) => {
    const tags = [hasTreaty(G, 'trade', G.player, X.id) ? '<span class="tflag good">соглашение</span>' : '', sanctioned(G, G.player, X.id) || sanctioned(G, X.id, G.player) ? '<span class="tflag bad">санкции</span>' : '', atWar(G, G.player, X.id) ? '<span class="tflag bad">война</span>' : ''].join('');
    const h = C.ph[X.id]; const tr = h ? sumSeries([h.ex, h.im]).slice(-60) : [];
    return `<tr class="click" data-act="partner" data-id="${X.id}"><td>${flagOf(X.id)}${X.short}${tags}</td><td class="num">${bn(ex)}</td><td class="num">${bn(im)}</td><td class="num ${cls(ex >= im)}">${bn(ex - im)}</td><td class="num">${pct((ex + im) / Math.max(1e-9, T.ex + T.im), 0)}</td><td>${spark(tr, 'auto', 56, 18)}</td></tr>`;
  }).join('');
  return `<div class="card"><table class="tbl"><tr><th>Страна</th><th class="num">Экспорт</th><th class="num">Импорт</th><th class="num">Сальдо</th><th class="num">Доля</th><th>5 лет</th></tr>${rows}</table><div class="mini">Нажмите на страну (или на неё на карте) — что мы продаём и покупаем, взаимная зависимость.</div></div>`;
};

function detailHead(title, tabs) {
  return `<div class="crumbs"><a data-act="dback">← Назад</a></div>${title}<div class="chips" style="margin-top:4px">${tabs.map(([id, n]) => `<button data-act="dtab" data-id="${id}" class="${detail.tab === id ? 'on' : ''}">${n}</button>`).join('')}</div>`;
}
function goodView() {
  const gid = detail.id, C = P(), g = GOOD[gid], s = C.gs[gid], pr = gP(gid), gm = G.goods[gid];
  detail.tab ||= 'market';
  const head = detailHead(`<div class="ghead"><span class="gbig">${g.icon}</span><div><h3>${g.name}</h3><div class="gprice">${priceStr(gid)} <span class="${chg12(gid) >= 0 ? 'up' : 'down'}">${spct(chg12(gid))} за год</span><span class="pill ${gm.lastExcess > 0.01 ? 'warn' : gm.lastExcess < -0.01 ? 'blue' : ''}">${gm.lastExcess > 0.01 ? 'дефицит на мировом рынке' : gm.lastExcess < -0.01 ? 'избыток предложения' : 'рынок сбалансирован'}</span></div></div></div>`,
    [['market', 'Рынок'], ['flows', 'Потоки'], ['chain', 'Цепочка'], ['policy', 'Политика']]);
  const self = s.prod / Math.max(1e-6, s.dem);
  const fl = G.flows[gid] || [];
  let body = '';
  if (detail.tab === 'market') {
    const rows = alive(G).map((X) => ({ X, s: X.gs[gid] }));
    const prodRows = rows.filter((r) => r.s.prod > 0.001).sort((a, b) => b.s.prod - a.s.prod).slice(0, 8).map((r) => ({ label: `${flagOf(r.X.id)}${r.X.short}`, value: r.s.prod * pr, color: r.X.id === G.player ? '#1f5fbf' : '#9aa6b5', act: 'partner', id: r.X.id }));
    const demRows = rows.filter((r) => r.s.dem > 0.001).sort((a, b) => b.s.dem - a.s.dem).slice(0, 8).map((r) => ({ label: `${flagOf(r.X.id)}${r.X.short}${r.s.shortR > 0.02 ? ` <small class="bad">дефицит ${pct(r.s.shortR, 0)}</small>` : ''}`, value: r.s.dem * pr, color: r.X.id === G.player ? '#1f5fbf' : '#9aa6b5', act: 'partner', id: r.X.id }));
    body = `<div class="kpis">${kpi('Производство', bn(s.prod * pr), 'загрузка ' + pct(s.prod / Math.max(1e-6, s.cap), 0))}${kpi('Потребление', bn(s.dem * pr), 'конечное ' + pct(G.fdK[gid] * s.F / Math.max(1e-6, s.dem), 0))}${kpi('Обеспеченность', pct(self, 0), self >= 1 ? 'нетто-экспортёр' : 'нетто-импортёр')}
      ${kpi('Экспорт', bn(s.ex * pr), s.unsoldR > 0.02 ? `<span class="bad">не продано ${pct(s.unsoldR, 0)}</span>` : 'всё продано')}${kpi('Импорт', bn(s.im * pr), s.shortR > 0.02 ? `<span class="bad">дефицит ${pct(s.shortR, 0)}</span>` : 'спрос покрыт')}${kpi('Внутренняя цена', pct(s.pLoc / pr, 0), 'от мировой')}</div>
      ${card(`Мировая цена, ${g.unit}`, chart('g_price', `data-g="${gid}"`))}
      ${card('Наш рынок, млрд $ в год', chart('g_mine', `data-g="${gid}"`))}
      <div class="grid2">${card('Крупнейшие производители', hbars(prodRows, bn))}${card('Крупнейшие потребители', hbars(demRows, bn))}</div>`;
  } else if (detail.tab === 'flows') {
    const fTot = fl.reduce((t, f) => t + f[2], 0);
    const buyers = fl.filter((f) => f[0] === G.player).map(([, b, v]) => ({ label: `${flagOf(b)}${G.countries[b].short}`, value: v, color: '#1f5fbf', act: 'partner', id: b }));
    const sources = fl.filter((f) => f[1] === G.player).map(([a, , v]) => ({ label: `${flagOf(a)}${G.countries[a].short}`, value: v, color: '#d68910', act: 'partner', id: a }));
    body = `<div class="grid2">${card('Наши покупатели', buyers.length ? hbars(buyers, bn) : '<div class="mini">Мы не экспортируем этот товар.</div>')}${card('Наши поставщики', sources.length ? hbars(sources, bn) : '<div class="mini">Мы не импортируем этот товар.</div>')}</div>
      ${card('Мировые торговые потоки', `<table class="tbl"><tr><th>Экспортёр</th><th>Импортёр</th><th class="num">Объём</th><th class="num">Доля</th></tr>${fl.slice(0, 25).map(([a, b, v]) => `<tr class="${a === G.player || b === G.player ? 'me' : ''}"><td>${cname(a)}</td><td>${cname(b)}</td><td class="num">${bn(v)}</td><td class="num">${pct(v / Math.max(1e-9, fTot), 1)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Каждая страна обеспечивает себя сама.</td></tr>'}</table>`, bn(fTot) + ' в год')}
      ${card('Мировое производство и торговля', chart('g_world', `data-g="${gid}"`))}
      <div class="mini">На карте: стрелки — потоки (синие — наш экспорт, оранжевые — наш импорт), цвет стран — чистый экспорт (зелёный) или импорт (красный).</div>`;
  } else if (detail.tab === 'chain') {
    const ins = Object.entries(IO[gid]).map(([i, a]) => `<div class="chain">${glink(i)}<span>${nf(a * 100, 0)} ¢ на $1</span>${C.gs[i].shortR > 0.02 ? `<em class="bad">дефицит ${pct(C.gs[i].shortR, 0)}</em>` : `<em>${C.gs[i].prod >= C.gs[i].dem ? 'своё' : 'импорт ' + pct(C.gs[i].im / Math.max(1e-6, C.gs[i].dem), 0)}</em>`}</div>`).join('') || '<div class="mini">Первичный ресурс — добывается или выращивается без сырья.</div>';
    const outs = (USED_IN[gid] || []).sort((a, b) => b[1] - a[1]).map(([o, a]) => `<div class="chain">${glink(o)}<span>${nf(a * 100, 0)} ¢ на $1</span><em>${bn(C.gs[o].prod * a * pr)}</em></div>`).join('') || '<div class="mini">Только конечное потребление.</div>';
    body = `${card('Из чего производится', ins + (Object.keys(IO[gid]).length ? `<div class="mini">Доступность сырья для нашего производства: <b class="${cls(s.avail > 0.95)}">${pct(s.avail, 0)}</b>. Дефицит сырья снижает выпуск.</div>` : ''))}${card('Где используется', outs + '<div class="mini">Справа — сколько этого товара уходит на производство у нас в год.</div>')}`;
  } else {
    const tariff = tariffOf(C, gid);
    const emb = alive(G).filter((X) => X.id !== G.player).map((X) => `<label class="embc"><input type="checkbox" data-k="tp.emb.${gid}>${X.id}" ${C.tp.emb[gid + '>' + X.id] ? 'checked' : ''}>${flagOf(X.id)}${X.short}</label>`).join('');
    body = `${card('Пошлины и субсидии', slider('tp.tariff.' + gid, 'Импортная пошлина' + (C.tp.tariff[gid] == null ? ' <span class="muted">(базовая)</span>' : ''), tariff, 0, 1, 0.01, pct(tariff, 0), false, 'Дороже импорт → меньше спрос на него, доход бюджету, защита своих производителей')
      + (C.tp.tariff[gid] != null ? `<div class="row"><button class="btn sm" data-act="tpreset" data-id="${gid}">Вернуть базовую ставку (${pct(C.eco.tax.tariff, 0)})</button></div>` : '')
      + slider('tp.duty.' + gid, 'Экспортная пошлина', C.tp.duty[gid] || 0, 0, 0.5, 0.01, pct(C.tp.duty[gid] || 0, 0), false, 'Доход бюджету, но наши поставки менее конкурентны')
      + slider('tp.sub.' + gid, 'Субсидия производителям, % выручки', C.tp.sub[gid] || 0, 0, 0.3, 0.01, pct(C.tp.sub[gid] || 0, 0) + ' · ' + bn((C.tp.sub[gid] || 0) * s.prod * pr), false, 'Отрасль постепенно растёт, экспорт дешевеет')
      + `<div class="row"><label><input type="checkbox" data-k="tp.ban.${gid}" ${C.tp.ban[gid] ? 'checked' : ''}> Запретить экспорт</label><span class="mini" style="margin:0">Излишки остаются внутри: цены падают, производители теряют.</span></div>`)}
      ${card('Товарное эмбарго', `<div class="embs">${emb}</div><div class="mini">Не продаём и не покупаем этот товар у отмеченных стран. Портит отношения.</div>`)}`;
  }
  return head + body;
}
function partnerView() {
  const id = detail.id, C = P(), X = G.countries[id], T = C.trade, xT = X.trade;
  detail.tab ||= 'trade';
  const ex = T.exBy[id] || 0, im = T.imBy[id] || 0;
  const tags = [atWar(G, G.player, id) ? '<span class="pill bad">война</span>' : '', hasTreaty(G, 'trade', G.player, id) ? '<span class="pill good">торговое соглашение</span>' : '', sanctioned(G, G.player, id) ? '<span class="pill bad">наши санкции</span>' : '', sanctioned(G, id, G.player) ? '<span class="pill bad">их санкции</span>' : '', hasTreaty(G, 'alliance', G.player, id) ? '<span class="pill blue">союзник</span>' : ''].join(' ');
  const head = detailHead(`<div class="ghead"><span class="flag lg" style="background:${X.color}"></span><div><h3>${X.name}</h3><div class="row" style="margin:2px 0 0">Отношения ${relTag(G.rel[G.player][id])} ${tags}<a class="clink" data-act="todiplo" data-id="${id}">Дипломатия →</a></div></div></div>`,
    [['trade', 'Торговля'], ['dep', 'Зависимости'], ['econ', 'Их экономика']]);
  let body = '';
  if (detail.tab === 'trade') {
    const exG = [], imG = [];
    for (const g of GOODS) for (const [a, b, v] of G.flows[g.id] || []) {
      if (a === G.player && b === id) exG.push({ label: `${g.icon} ${g.name}`, value: v, color: '#1f5fbf', act: 'good', id: g.id });
      if (a === id && b === G.player) imG.push({ label: `${g.icon} ${g.name}`, value: v, color: '#d68910', act: 'good', id: g.id });
    }
    exG.sort((a, b) => b.value - a.value); imG.sort((a, b) => b.value - a.value);
    body = `<div class="kpis">${kpi('Наш экспорт к ним', bn(ex), pct(ex / Math.max(1e-9, T.ex), 0) + ' всего экспорта')}${kpi('Наш импорт от них', bn(im), pct(im / Math.max(1e-9, T.im), 0) + ' всего импорта')}${kpi('Сальдо', `<span class="${cls(ex >= im)}">${bn(ex - im)}</span>`)}</div>
      ${card('Двусторонняя торговля, млрд $ в год', chart('p_bi', `data-c="${id}"`))}
      <div class="grid2">${card('Что мы продаём', exG.length ? hbars(exG, bn) : '<div class="mini">Ничего.</div>')}${card('Что покупаем', imG.length ? hbars(imG, bn) : '<div class="mini">Ничего.</div>')}</div>`;
  } else if (detail.tab === 'dep') {
    const dep = (from, to) => GOODS.map((g) => { const f = (G.flows[g.id] || []).find((r) => r[0] === from && r[1] === to); if (!f) return null; return { g, share: f[2] / Math.max(1e-9, G.countries[to].gs[g.id].dem * gP(g.id)), v: f[2] }; }).filter((r) => r && r.share > 0.08).sort((a, b) => b.share - a.share);
    const row = (r) => `<div class="chain">${glink(r.g.id)}<span>${pct(r.share, 0)} их потребления</span><em>${bn(r.v)}</em></div>`;
    const theirs = dep(G.player, id), ours = dep(id, G.player);
    body = `${card(`${X.short} зависит от нас`, (theirs.map(row).join('') || '<div class="mini">Критической зависимости нет.</div>') + '<div class="mini">Эмбарго по этим товарам ударит по ним сильнее всего.</div>')}
      ${card(`Мы зависим от ${X.short}`, (ours.map((r) => row(r).replace('их потребления', 'нашего потребления')).join('') || '<div class="mini">Критической зависимости нет.</div>') + '<div class="mini">Если они введут санкции — здесь возникнет дефицит.</div>')}`;
  } else {
    const theirEx = GOODS.map((g) => ({ label: `${g.icon} ${g.name}`, value: xT.exG[g.id] || 0, color: '#1f5fbf', act: 'good', id: g.id })).filter((r) => r.value > 0.01).sort((a, b) => b.value - a.value).slice(0, 7);
    const theirIm = GOODS.map((g) => ({ label: `${g.icon} ${g.name}`, value: xT.imG[g.id] || 0, color: '#d68910', act: 'good', id: g.id })).filter((r) => r.value > 0.01).sort((a, b) => b.value - a.value).slice(0, 7);
    body = `<div class="kpis">${kpi('ВВП', bn(X.eco.gdp), spct(X.eco.growth) + ' за год')}${kpi('На душу', nf(X.eco.gdp / X.pop * 1000) + ' $', 'инфляция ' + pct(X.eco.infl))}${kpi('Экспорт / импорт', bn(xT.ex), 'импорт ' + bn(xT.im))}</div>
      ${card('ВВП, млрд $', chart('p_gdp', `data-c="${id}"`))}
      <div class="grid2">${card('Их главный экспорт', hbars(theirEx, bn))}${card('Их главный импорт', hbars(theirIm, bn))}</div>`;
  }
  return head + body;
}

// =================== ОБЩЕСТВО ===================
VIEWS['society.groups'] = () => {
  const C = P(), pol = C.pol, M = lawMods(C), T = groupTargets(C, M);
  const tmp = {}; for (const m of pol.gmods) tmp[m.g] = (tmp[m.g] || 0) + m.v;
  const groups = Object.entries(GROUPS).map(([g, G0]) => {
    const v = pol.groups[g] ?? 50;
    const worst = [...T[g].drivers].sort((a, b) => a.v - b.v).slice(0, 3).map((d) => `${d.name} <b class="${cls(d.v > 50)}">${nf(d.v)}</b>`).join(' · ');
    const lm = M.groups[g] || 0, tm = tmp[g] || 0;
    return `<div class="grp"><div class="grp-h"><span>${G0.icon}</span><b>${G0.name}</b><small>${pct(pol.groupShares[g], 0)} населения${G0.elite ? ' · элита' : ''}</small><em style="color:${barColor(v)}">${nf(v)}</em></div>${bar(v)}
      <div class="mini">${worst}${lm ? ` · законы <b class="${cls(lm > 0)}">${lm > 0 ? '+' : ''}${nf(lm)}</b>` : ''}${tm ? ` · события <b class="${cls(tm > 0)}">${tm > 0 ? '+' : ''}${nf(tm)}</b>` : ''}</div></div>`;
  }).join('');
  return `<div class="kpis">${kpi('Одобрение', nf(pol.approval), 'среднее по населению')}${kpi('Стабильность', `<span class="${cls(pol.stability > 40)}">${nf(pol.stability)}</span>`, pol.stability < 35 ? 'опасно' : 'норма')}${kpi('Усталость от власти', '−' + nf(pol.fatigue || 0), 'растёт со временем')}</div>
    ${card('Социальные группы', groups, 'удовлетворённость 0–100')}<div class="mini">Под каждой группой — три самых болезненных для неё показателя. Элиты сильнее влияют на стабильность при автократии.</div>`;
};
VIEWS['society.dev'] = () => {
  const C = P(), s = C.soc, e = C.eco;
  const idx = [['Образование', s.edu], ['Здравоохранение', s.health], ['Инфраструктура', s.infra], ['Наука', s.science], ['Гражданские свободы', s.freedom]];
  return `<div class="kpis">${kpi('Население', nf(C.pop, 1) + ' млн', spct(C.pop_g || 0, 2) + ' в год')}${kpi('Коррупция', `<span class="${cls(s.corruption < 40)}">${nf(s.corruption)}</span>`, 'из 100, ниже — лучше')}${kpi('Неравенство', nf(e.gini, 2), 'индекс Джини')}</div>
    ${card('Индексы развития', idx.map(([n, v]) => `<div class="irow"><span>${n}</span>${bar(v)}<b>${nf(v)}</b></div>`).join('') + `<div class="irow"><span>Коррупция</span>${bar(s.corruption, barColor(100 - s.corruption))}<b>${nf(s.corruption)}</b></div><div class="mini">Индексы следуют за расходами бюджета и законами — медленно, за годы.</div>`)}
    ${card('Одобрение и стабильность', chart('appr'))}`;
};

// =================== ПОЛИТИКА ===================
function hemicycle(seats) {
  const order = ['left', 'green', 'lib', 'cons', 'nat'];
  const list = []; for (const p of order) for (let i = 0; i < (seats[p] || 0); i++) list.push(p);
  const pts = [];
  [12, 16, 20, 24, 28].forEach((n, ri) => { const R = 40 + ri * 13; for (let i = 0; i < n; i++) { const a = Math.PI - Math.PI * (i / (n - 1)); pts.push([a, 120 + R * Math.cos(a), 115 - R * Math.sin(a)]); } });
  pts.sort((a, b) => b[0] - a[0]);
  let h = '', k = 0;
  for (const [, x, y] of pts) { const p = list[k++]; if (!p) break; h += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.3" fill="${PARTIES[p].color}"/>`; }
  return `<svg viewBox="0 0 240 122" class="hemi">${h}</svg>`;
}
VIEWS['politics.parl'] = () => {
  const C = P(), pol = C.pol, every = GOV[C.gov].electionEvery;
  const sup = Object.entries(pol.support).sort((a, b) => b[1] - a[1]).map(([p, v]) => `<div class="party"><span class="pdot" style="background:${PARTIES[p].color}"></span><span>${PARTIES[p].name} ${p === C.party ? '<span class="pill blue">правящая</span>' : pol.coalition.includes(p) ? '<span class="pill">коалиция</span>' : ''}</span><span></span><em>${pct(v, 1)}</em><small>${pol.seats[p] || 0} мест</small>${bar(v * 250, PARTIES[p].color)}</div>`).join('');
  const coalSeats = pol.coalition.reduce((s, p) => s + (pol.seats[p] || 0), 0);
  return `<div class="kpis">${kpi('Режим', GOV[C.gov].name, 'свобода ' + nf(C.soc.freedom))}${kpi('Выборы', every ? `через ${pol.nextElection} мес.` : 'не проводятся', every ? 'каждые ' + every / 12 + ' лет' : '')}${kpi('Коалиция', coalSeats + ' из 100', pol.coalition.map((p) => PARTIES[p].short).join(' + '))}</div>
    <div class="grid2">${card('Парламент', hemicycle(pol.seats) + (pol.lastElection ? `<div class="mini" style="text-align:center">Последние выборы: ${pol.lastElection.d}</div>` : ''))}${card('Рейтинги партий', sup)}</div>
    <div class="mini">Поддержка правящей партии зависит от удовлетворённости групп, которые за неё голосуют. Недовольные уходят к оппозиции.</div>`;
};
const MOD_N = {
  growth: ['Рост экономики', (v) => spct(v, 1)], growthTech: ['Рост хай-тека', (v) => spct(v, 1)], growthInd: ['Рост промышленности', (v) => spct(v, 1)], growthAgri: ['Рост АПК', (v) => spct(v, 1)], growthMining: ['Рост добычи', (v) => spct(v, 1)],
  nairu: ['Безработица', (v) => spct(v, 1), true], gini: ['Неравенство', (v) => (v > 0 ? '+' : '') + nf(v, 2), true], freedom: ['Свобода', (v) => (v > 0 ? '+' : '') + v], corruption: ['Коррупция', (v) => (v > 0 ? '+' : '') + v, true],
  stability: ['Стабильность', (v) => (v > 0 ? '+' : '') + v], openness: ['Открытость', (v) => spct(v, 0)], inflation: ['Инфляция', (v) => spct(v, 1), true], compliance: ['Собираемость', (v) => spct(v, 0)],
  invest: ['Инвестиции', (v) => spct(v, 1)], popGrowth: ['Прирост населения', (v) => spct(v, 1)], manpower: ['Мобресурс', (v) => spct(v, 0)], milQuality: ['Качество армии', (v) => spct(v, 0)], socialSave: ['Экономия соцрасходов', (v) => pct(v, 1) + ' ВВП'],
  eduT: ['Образование', (v) => '+' + v], healthT: ['Здравоохранение', (v) => '+' + v], sciT: ['Наука', (v) => '+' + v], infraT: ['Инфраструктура', (v) => '+' + v], electionBonus: ['Бонус на выборах', (v) => spct(v, 0)],
  resRent: ['Ресурсная рента', (v) => spct(v, 0)], confidence: ['Доверие бизнеса', (v) => (v > 0 ? '+' : '') + v], spendExtra: ['Расходы', (v) => '+' + pct(v, 1) + ' ВВП', true], credibility: ['Доверие к ЦБ', (v) => spct(v, 0)], incBoost: ['Доход НДФЛ', (v) => spct(v, 0)],
  pcUpkeep: ['Политкапитал/мес', (v) => '−' + v, true], rateRule: ['Ставка по правилу Тейлора', () => ''], tariffCap: ['Пошлины не выше', (v) => pct(v, 0)],
};
function lawEffects(L) {
  const m = Object.entries(L.mods || {}).map(([k, v]) => { const d = MOD_N[k]; if (!d) return ''; const good = d[2] ? v < 0 : v > 0; return `<span class="eff ${['rateRule', 'tariffCap'].includes(k) ? '' : cls(good)}">${d[0]} ${d[1](v)}</span>`; }).join('');
  const g = Object.entries(L.groups || {}).map(([k, v]) => `<span class="eff ${cls(v > 0)}">${GROUPS[k].icon} ${GROUPS[k].name} ${v > 0 ? '+' : ''}${v}</span>`).join('');
  return m + g + (L.onPass?.cash ? `<span class="eff good">Разово +${pct(L.onPass.cash, 0)} ВВП</span>` : '');
}
VIEWS['politics.laws'] = () => {
  const C = P();
  const chips = Object.entries(LAW_CATS).map(([k, n]) => `<button data-act="lawcat" data-id="${k}" class="${k === lawCat ? 'on' : ''}">${n}</button>`).join('');
  const list = LAWS.filter((L) => L.cat === lawCat).map((L) => {
    const active = C.pol.laws.includes(L.id), av = lawAvailable(C, L.id), v = lawVote(G, C, L.id, active);
    const pc = active ? Math.ceil(L.pc * 0.6) : L.pc;
    const conflict = !active && L.excl ? C.pol.laws.map((id) => LAW_BY_ID[id]).find((x) => x.excl === L.excl) : null;
    let btn;
    if (active) btn = L.regime ? '<span class="pill blue">действует</span>' : `<span class="pill blue">действует</span>${v.pass ? `<button class="btn sm" data-act="repeal" data-id="${L.id}">Отменить · ${pc} ПК</button>` : `<button class="btn sm" data-act="repeal_lobby" data-id="${L.id}">Продавить отмену · ${pc + v.lobbyCost} ПК</button>`}`;
    else if (!av.ok) btn = `<span class="pill">${av.why}</span>`;
    else btn = v.pass ? `<button class="btn sm primary" data-act="pass" data-id="${L.id}">Принять · ${pc} ПК</button>` : `<button class="btn sm" data-act="pass_lobby" data-id="${L.id}">Продавить · ${pc + v.lobbyCost} ПК</button>`;
    const votes = C.gov === 'autocracy' ? 'Парламент послушен' : `За: <b class="${cls(v.pass)}">${v.yes}</b> из 100 ` + Object.entries(v.parties).map(([p, y]) => `<span class="vote ${y ? 'y' : 'n'}" style="--pc:${PARTIES[p].color}">${PARTIES[p].short} ${C.pol.seats[p]}</span>`).join('');
    return `<div class="law ${active ? 'active' : ''}"><div class="law-h"><b>${L.name}</b>${btn}</div><p>${L.desc}</p><div class="effs">${lawEffects(L)}</div><div class="votes">${votes}${conflict ? ` <span class="warn">· заменит «${conflict.name}»</span>` : ''}</div></div>`;
  }).join('');
  return `<div class="chips">${chips}</div>${list}`;
};
VIEWS['politics.decrees'] = () => {
  const C = P(), pol = C.pol, every = GOV[C.gov].electionEvery;
  const D = (id, name, cost, desc) => `<div class="decree"><div><b>${name}</b><small>${desc}</small></div><button class="btn sm" data-act="decree" data-id="${id}">${cost}</button></div>`;
  return `<div class="kpis">${kpi('Политкапитал', nf(pol.pc), '+' + nf(0.8 + pol.approval / 45 + GOV[C.gov].pcBonus - lawMods(C).pcUpkeep, 1) + ' в месяц')}${kpi('Одобрение', nf(pol.approval), '')}${kpi('Стабильность', nf(pol.stability), '')}</div>
    ${card('Политические решения', D('propaganda', 'Информационная кампания', '10 ПК', 'Все группы +4 на полгода') + D('reshuffle', 'Перестановки в правительстве', '25 ПК', 'Снимает часть усталости от власти и негатив от событий') + (every ? D('snap', 'Досрочные выборы', '15 ПК', 'Обновить парламент, пока рейтинг высок') : ''))}
    ${card('Программы поддержки групп', Object.entries(GROUPS).map(([g, x]) => D('pay_' + g, `${x.icon} ${x.name}`, '6 ПК + 0,3% ВВП', '+12 к удовлетворённости на год')).join(''))}`;
};

// =================== ВНЕШНЯЯ ПОЛИТИКА ===================
const ACT_GROUPS = [['Дипломатия', ['visit', 'aid', 'nap', 'alliance', 'break_alliance']], ['Экономика', ['trade', 'cancel_trade', 'sanction', 'lift_sanction']], ['Война и мир', ['war', 'peace_white', 'peace_annex']]];
VIEWS['foreign.countries'] = () => {
  const C = P();
  if (!selC || selC === G.player || !G.countries[selC]?.alive) selC = alive(G).find((x) => x.id !== G.player)?.id;
  const list = alive(G).filter((X) => X.id !== G.player).sort((a, b) => G.rel[G.player][b.id] - G.rel[G.player][a.id]).map((X) => {
    const t = [atWar(G, G.player, X.id) ? 'война' : '', hasTreaty(G, 'alliance', G.player, X.id) ? 'союз' : '', hasTreaty(G, 'trade', G.player, X.id) ? 'торговля' : '', sanctioned(G, G.player, X.id) || sanctioned(G, X.id, G.player) ? 'санкции' : ''].filter(Boolean).join(' · ');
    return `<button class="crow ${X.id === selC ? 'on' : ''}" data-act="selc" data-id="${X.id}"><span>${flagOf(X.id)}${X.short}</span>${relTag(G.rel[G.player][X.id])}${t ? `<small>${t}</small>` : ''}</button>`;
  }).join('');
  const X = G.countries[selC], xs = strength(G, X), ms = strength(G, C);
  const acts = ACT_GROUPS.map(([gname, ids]) => {
    const items = ids.map((a) => { const c = canDo(G, G.player, X.id, a); if (!c.ok && /Нет|Уже|Санкций нет|Мир заключают|Нет союза|Нет соглашения/.test(c.why)) return ''; return `<button class="act ${a === 'war' ? 'danger' : ''}" data-act="diplo" data-id="${a}" ${c.ok ? '' : 'disabled'}><b>${ACTIONS[a].name}</b><small>${ACTIONS[a].desc}</small><em>${ACTIONS[a].pc} ПК</em>${c.ok ? '' : `<i>${c.why}</i>`}</button>`; }).join('');
    return items ? `<div class="grp-title">${gname}</div><div class="acts">${items}</div>` : '';
  }).join('');
  return `<div class="split"><div class="clist">${list}</div><div>
    <div class="card"><div class="dhead"><span class="flag lg" style="background:${X.color}"></span><div><h3>${X.name}</h3><small>${GOV[X.gov].name} · ${PARTIES[X.party].name} · ${BLOCS[X.bloc].name}</small></div></div>
      <div class="kv"><div><span>Отношение к нам</span><b>${relTag(G.rel[X.id][G.player])}</b></div><div><span>ВВП · на душу</span><b>${bn(X.eco.gdp)} · ${nf(X.eco.gdp / X.pop * 1000)} $</b></div>
      <div><span>Торговля с нами</span><b>${bn((C.trade.exBy[X.id] || 0) + (C.trade.imBy[X.id] || 0))} <a class="clink" data-act="partner" data-id="${X.id}">подробно →</a></b></div>
      <div><span>Военная мощь</span><b class="${cls(ms >= xs)}">${nf(xs)} <span class="muted">(у нас ${nf(ms)})</span></b></div><div><span>Стабильность</span><b>${nf(X.pol.stability)}</b></div>
      <div><span>Союзники</span><b>${alive(G).filter((Y) => Y.id !== X.id && hasTreaty(G, 'alliance', X.id, Y.id)).map((Y) => Y.short).join(', ') || '—'}</b></div></div></div>
    ${card('Действия', acts + `<div class="mini">Политкапитал: <b>${nf(C.pol.pc)}</b></div>`)}</div></div>`;
};
VIEWS['foreign.blocs'] = () => {
  const C = P();
  return Object.entries(BLOCS).map(([b, B]) => {
    const members = alive(G).filter((X) => X.bloc === b);
    const mine = C.bloc === b;
    return card(`<span><span class="flag" style="background:${B.color}"></span>${B.name}</span>`, `<div class="row">${members.map((X) => `<span class="pill">${flagOf(X.id)}${X.short}</span>`).join('') || '<span class="muted">Нет участников</span>'}</div>
      <div class="row">${mine ? '<span class="pill blue">мы здесь</span>' : `<button class="btn sm" data-act="bloc" data-id="${b}">${b === 'none' ? 'Объявить нейтралитет' : 'Вступить'} · 20 ПК</button>`}</div>`);
  }).join('') + '<div class="mini">Вступление требует средних отношений ≥ 35 с членами блока. Даёт торговые соглашения со всеми членами, но портит отношения с соперниками.</div>';
};
VIEWS['foreign.army'] = () => {
  const C = P(), e = C.eco, M = lawMods(C);
  const ws = wars(G, C.id).map((w) => {
    const mine = w.sideA.includes(C.id), my = mine ? w.score : -w.score, enemy = mine ? w.sideB : w.sideA, friends = mine ? w.sideA : w.sideB;
    const occ = G.provs.filter((p) => p.land && enemy.includes(p.owner) && friends.includes(p.ctrl)).length, lost = G.provs.filter((p) => p.land && friends.includes(p.owner) && enemy.includes(p.ctrl)).length;
    const lead = mine ? w.b : w.a;
    return `<div class="war"><div class="between"><b>${friends.map((i) => G.countries[i].short).join(', ')} против ${enemy.map((i) => G.countries[i].short).join(', ')}</b><small class="muted">${w.months} мес.</small></div>
      <div class="front"><i style="left:${50 + my / 2}%"></i></div><div class="row mini" style="margin:0">Перевес <b class="${cls(my >= 0)}">${nf(my)}</b> · заняли ${occ} пров. · потеряли ${lost} пров.</div>
      ${(w.a === C.id || w.b === C.id) ? `<div class="row"><button class="btn sm" data-act="peace" data-id="${lead}" data-t="peace_white">Мир на статус-кво</button><button class="btn sm" data-act="peace" data-id="${lead}" data-t="peace_annex">Потребовать аннексии</button></div>` : '<div class="mini">Мы участвуем как союзник.</div>'}</div>`;
  }).join('') || '<div class="mini">Мирное время.</div>';
  const rank = alive(G).map((X) => [X, strength(G, X)]).sort((a, b) => b[1] - a[1]), max = rank[0][1];
  return `<div class="kpis k4">${kpi('Военная мощь', nf(strength(G, C)), (rank.findIndex(([X]) => X.id === C.id) + 1) + '-е место в мире')}${kpi('Арсенал', bn(C.mil.equip), 'накоплено')}${kpi('Боевой дух', pct(C.mil.morale, 0))}${kpi('Усталость от войны', nf(C.pol.warWeariness))}</div>
    ${card('Войны', ws)}
    ${card('Управление армией', slider('spend.defense', 'Оборонный бюджет', e.spend.defense, 0, 0.12, 0.001, pct(e.spend.defense) + ' ВВП · ' + bn(e.spend.defense * e.gdp)) + `<div class="row"><label><input type="checkbox" data-k="mobilized" ${C.mil.mobilized ? 'checked' : ''}> Мобилизация: мощь ×1,4, расходы +1,2% ВВП, недовольство</label></div><div class="mini">Армия ${M.manpower > 0.2 ? 'призывная' : M.milQuality > 0 ? 'контрактная' : 'смешанная'} — меняется законом. Поставки вооружения влияют на пополнение арсенала.</div>`)}
    ${card('Баланс сил', rank.map(([X, s]) => `<div class="irow"><span>${flagOf(X.id)}${X.short}</span>${bar(s / max * 100, X.id === G.player ? '#1f5fbf' : '#9aa6b5')}<b>${nf(s)}</b></div>`).join(''))}`;
};

// =================== МИР ===================
VIEWS['world.rank'] = () => {
  const rows = alive(G).sort((a, b) => b.eco.gdp - a.eco.gdp).map((X) => `<tr class="click ${X.id === G.player ? 'me' : ''}" data-act="todiplo" data-id="${X.id}"><td>${flagOf(X.id)}${X.short}</td><td class="num">${bn(X.eco.gdp)}</td><td class="num">${nf(X.eco.gdp / X.pop, 1)}k</td><td class="num ${cls(X.eco.growth > 0.015)}">${spct(X.eco.growth)}</td><td class="num">${pct(X.eco.infl)}</td><td class="num">${pct(X.eco.debt / X.eco.gdp, 0)}</td><td class="num">${nf(X.pol.stability)}</td><td>${PARTIES[X.party].short}</td></tr>`).join('');
  const dead = Object.values(G.countries).filter((X) => !X.alive).map((X) => X.short).join(', ');
  return `${card('Мировой рейтинг', `<table class="tbl"><tr><th>Страна</th><th class="num">ВВП</th><th class="num">На душу</th><th class="num">Рост</th><th class="num">Инфл.</th><th class="num">Долг</th><th class="num">Стаб.</th><th>Власть</th></tr>${rows}</table>${dead ? `<div class="mini">Исчезли с карты: ${dead}</div>` : ''}`)}
    ${card('Войны в мире', G.wars.map((w) => `<div class="row">${w.sideA.map((i) => G.countries[i].short).join(', ')} — ${w.sideB.map((i) => G.countries[i].short).join(', ')} <span class="muted">${w.months} мес.</span></div>`).join('') || '<div class="mini">Мир во всём мире.</div>')}
    ${card('Цель', `<div class="mini" style="margin:0">Продержаться у власти до ${END_YEAR} года. Счёт учитывает рост ВВП на душу, одобрение, стабильность, территорию и долг. Текущий счёт: <b>${nf(score(G, P()))}</b></div>`)}`;
};
VIEWS['world.charts'] = () => `${card('ВВП стран, млрд $', chart('w_gdp'))}${card('Мировая торговля по категориям, млрд $ в год', chart('w_trade'))}${card('Ценовые индексы мировых рынков (2030 = 100)', chart('tr_catidx'))}`;

// =================== ГРАФИКИ ===================
const CAT_COL = { raw: '#b5651d', agri: '#6a9f3a', industry: '#1f5fbf', tech: '#7e57c2', services: '#2a9d8f' };
function drawCharts() {
  const C = P(), h = C.hist, lab = dateLbl;
  for (const cv of document.querySelectorAll('canvas[data-chart]')) {
    const k = cv.dataset.chart, gid = cv.dataset.g, cid = cv.dataset.c;
    const L = (series, opts = {}) => lineChart(cv, series, { labels: lab, ...opts });
    if (k === 'gdp') L([{ name: 'ВВП', data: h.gdp, color: '#1f5fbf', fill: true }], { fmt: (v) => nf(v) });
    if (k === 'appr') L([{ name: 'Одобрение', data: h.approval, color: '#2e9d5b' }, { name: 'Стабильность', data: h.stability, color: '#7e57c2' }], { fmt: (v) => nf(v) });
    if (k === 'debt') L([{ name: 'Долг', data: h.debt.map((v) => v * 100), color: '#c0504d' }, { name: 'Дефицит', data: h.deficit.map((v) => v * 100), color: '#8a94a1' }], { fmt: (v) => nf(v) + '%', zero: true });
    if (k === 'e_sect') L([{ name: 'АПК', data: h.agri, color: CAT_COL.agri }, { name: 'Добыча', data: h.mining, color: CAT_COL.raw }, { name: 'Промышленность', data: h.industry, color: CAT_COL.industry }, { name: 'Хай-тек', data: h.tech, color: CAT_COL.tech }, { name: 'Услуги', data: h.services, color: CAT_COL.services }], { stacked: true, fmt: (v) => nf(v), height: 170 });
    if (k === 'e_growth') L([{ name: 'Рост', data: h.gdp.map((v, i) => (i >= 12 ? (v / h.gdp[i - 12] - 1) * 100 : NaN)), color: '#1f5fbf' }], { fmt: (v) => nf(v, 1) + '%', zero: true });
    if (k === 'e_unemp') L([{ name: 'Безработица', data: h.unemp.map((v) => v * 100), color: '#d68910', fill: true }], { fmt: (v) => nf(v, 1) + '%' });
    if (k === 'e_rate') L([{ name: 'Ставка', data: h.rate.map((v) => v * 100), color: '#1f5fbf' }, { name: 'Инфляция', data: h.infl.map((v) => v * 100), color: '#c0504d' }], { fmt: (v) => nf(v, 1) + '%', zero: true });
    if (k === 'e_fx') L([{ name: 'Курс', data: h.fx, color: '#2a9d8f' }, { name: 'Корзина ×100', data: h.cpi.map((v) => v * 100), color: '#d68910' }], { fmt: (v) => nf(v) });
    if (k === 'b_revexp') L([{ name: 'Доходы', data: h.rev, color: '#2e9d5b' }, { name: 'Расходы', data: h.exp, color: '#c0504d' }], { fmt: (v) => nf(v) });
    if (k === 'tr_exim') L([{ name: 'Экспорт', data: h.ex, color: '#1f5fbf' }, { name: 'Импорт', data: h.im, color: '#d68910' }, { name: 'Сальдо', data: h.ex.map((v, i) => v - h.im[i]), color: '#8a94a1' }], { fmt: (v) => nf(v), zero: true });
    if (k === 'tr_catidx') L(CAT_ORDER.filter((c) => c !== 'services').map((c) => { const gs = GOODS.filter((g) => g.cat === c); return { name: GOOD_CATS[c].name.split(' ')[0], data: sumSeries(gs.map((g) => G.goods[g.id].hist.map((v) => v / g.base * 100 / gs.length))), color: CAT_COL[c] }; }), { fmt: (v) => nf(v) });
    if (k === 'g_price') L([{ name: GOOD[gid].name, data: G.goods[gid].hist, color: CAT_COL[GOOD[gid].cat], fill: true }], { fmt: (v) => nf(v, v < 10 ? 2 : 0), height: 150 });
    if (k === 'g_mine') { const gh = C.gh[gid]; L([{ name: 'Производство', data: gh.prod, color: '#2e9d5b' }, { name: 'Потребление', data: gh.dem, color: '#c0504d' }, { name: 'Экспорт', data: gh.ex, color: '#1f5fbf' }, { name: 'Импорт', data: gh.im, color: '#d68910' }], { fmt: (v) => nf(v, 1) }); }
    if (k === 'g_world') L([{ name: 'Производство', data: G.goods[gid].wprod, color: '#2e9d5b' }, { name: 'Торговля', data: G.goods[gid].vol, color: '#1f5fbf' }], { fmt: (v) => nf(v), zero: true });
    if (k === 'p_bi') L([{ name: 'Наш экспорт', data: C.ph[cid]?.ex || [], color: '#1f5fbf' }, { name: 'Наш импорт', data: C.ph[cid]?.im || [], color: '#d68910' }], { fmt: (v) => nf(v, 1), zero: true });
    if (k === 'p_gdp') { const X = G.countries[cid]; L([{ name: 'ВВП', data: X.hist.gdp, color: '#1f5fbf', fill: true }], { fmt: (v) => nf(v) }); }
    if (k === 'w_gdp') L(alive(G).map((X) => ({ name: X.short, data: X.hist.gdp, color: X.color })), { fmt: (v) => nf(v), height: 170 });
    if (k === 'w_trade') L(CAT_ORDER.map((c) => ({ name: GOOD_CATS[c].name.split(' ')[0], data: sumSeries(GOODS.filter((g) => g.cat === c).map((g) => G.goods[g.id].vol)), color: CAT_COL[c] })), { stacked: true, fmt: (v) => nf(v) });
  }
}

// =================== КАРТА ===================
function syncMap() {
  const P0 = G.player;
  if (detail?.kind === 'good') {
    const gid = detail.id;
    const fl = (G.flows[gid] || []).slice(0, 24).map(([a, b, v]) => ({ from: a, to: b, value: v, color: a === P0 ? '#1f5fbf' : b === P0 ? '#d68910' : '#6b7684', label: `${G.countries[a].short} → ${G.countries[b].short}: ${bn(v)}` }));
    if (map.mode !== 'good') { map._prevMode = map.mode; map.mode = 'good'; }
    map.setFlows(fl, gid);
  } else {
    if (map.mode === 'good') map.mode = map._prevMode || 'political';
    let fl = [];
    if (detail?.kind === 'partner') {
      const id = detail.id;
      for (const g of GOODS) for (const [a, b, v] of G.flows[g.id] || []) if ((a === P0 && b === id) || (a === id && b === P0)) fl.push({ from: a, to: b, value: v, color: a === P0 ? '#1f5fbf' : '#d68910', label: `${g.name}: ${bn(v)}` });
      fl.sort((x, y) => y.value - x.value); fl = fl.slice(0, 10);
    } else if (sec === 'trade') {
      const C = P();
      for (const [d, v] of Object.entries(C.trade.exBy)) if (v > 0.5) fl.push({ from: P0, to: d, value: v, color: '#1f5fbf', label: `Экспорт в ${G.countries[d].short}: ${bn(v)}` });
      for (const [d, v] of Object.entries(C.trade.imBy)) if (v > 0.5) fl.push({ from: d, to: P0, value: v, color: '#d68910', label: `Импорт из ${G.countries[d].short}: ${bn(v)}` });
    }
    map.setFlows(fl, null);
  }
  const want = detail?.kind === 'partner' ? detail.id : sec === 'foreign' && sub() === 'countries' ? selC : null;
  if (map.sel !== want) map.select(want);
  markModes(); renderLegend();
}
const LEGENDS = {
  political: () => `<div class="lg-row"><span class="sw" style="background:repeating-linear-gradient(45deg,#c9a,#c9a 2px,#fff 2px,#fff 4px)"></span>оккупированная территория</div><div class="lg-row"><span class="sw" style="border:2px solid #1d2430;border-radius:50%;width:10px;height:10px"></span>столица</div>`,
  relations: () => `Отношения с нами<div class="grad" style="background:linear-gradient(90deg,#d9534f,#e4e7eb,#3a9d5d)"></div><div class="lg-ends"><span>−100</span><span>0</span><span>+100</span></div>`,
  bloc: () => Object.values(BLOCS).map((b) => `<div class="lg-row"><span class="sw" style="background:${b.color}"></span>${b.name}</div>`).join(''),
  gdppc: () => `ВВП на душу населения<div class="grad" style="background:linear-gradient(90deg,#eef1f4,#2a6fdb)"></div><div class="lg-ends"><span>бедные</span><span>богатые</span></div>`,
  stability: () => `Стабильность<div class="grad" style="background:linear-gradient(90deg,#d9534f,#3a9d5d)"></div><div class="lg-ends"><span>0</span><span>100</span></div>`,
  resources: () => [['#2d3440', 'нефть'], ['#2f7fd1', 'газ'], ['#8a5a44', 'железная руда'], ['#d0803a', 'медь'], ['#8b62d9', 'редкоземы'], ['#5b6270', 'уголь']].map(([c, n]) => `<div class="lg-row"><span class="sw" style="background:${c};border-radius:50%"></span>${n}</div>`).join(''),
  terrain: () => [['#dfe5c8', 'равнины'], ['#bccfae', 'леса'], ['#d3cbc2', 'горы'], ['#efe2bf', 'пустыни'], ['#dde3e6', 'тундра']].map(([c, n]) => `<div class="lg-row"><span class="sw" style="background:${c}"></span>${n}</div>`).join(''),
  good: () => `${GOOD[map.good]?.icon || ''} ${GOOD[map.good]?.name || ''}: чистый экспорт<div class="grad" style="background:linear-gradient(90deg,#d9534f,#e4e7eb,#2e9d5b)"></div><div class="lg-ends"><span>импортёр</span><span>экспортёр</span></div>`,
};
function renderLegend() {
  let h = (LEGENDS[map.mode] || LEGENDS.political)();
  if (map.flows?.length) h += `<div class="lg-row" style="margin-top:4px"><span class="sw" style="background:#1f5fbf;height:3px"></span>наш экспорт <span class="sw" style="background:#d68910;height:3px;margin-left:6px"></span>импорт</div>`;
  $('#legend').innerHTML = h;
}
function onProvClick(p) {
  if (p.owner === G.player) { if (sec === 'trade') detail = null; else go('summary'); renderContent(); return; }
  if (sec === 'trade') { detail = { kind: 'partner', id: p.owner }; $('#cbody').scrollTop = 0; renderContent(); return; }
  selC = p.owner; go('foreign', 'countries');
}
const TERR = { plain: 'равнина', forest: 'леса', mountain: 'горы', desert: 'пустыня', tundra: 'тундра' };
const RN = { oil: 'нефть', gas: 'газ', coal: 'уголь', iron: 'руда', copper: 'медь', rare: 'редкоземы', timber: 'лес' };
function onHover(p, ev) {
  const t = $('#tip');
  if (!p) { t.hidden = true; return; }
  const C = G.countries[p.owner];
  const res = Object.keys(RN).filter((k) => (p.res[k] || 0) > 0.05).map((k) => RN[k]).join(', ');
  let extra = '';
  if (map.mode === 'good' && C.gs?.[map.good]) { const s = C.gs[map.good], pr = gP(map.good); extra = `<br>Экспорт ${bn(s.ex * pr)} · импорт ${bn(s.im * pr)}`; }
  t.innerHTML = `<b>${flagOf(C.id)}${C.short}</b>${p.capital ? ' · столица' : ''}<br><span class="muted">${TERR[p.terrain]}${res ? ' · ' + res : ''}</span>${p.ctrl !== p.owner ? `<br><span class="bad">Оккупировано: ${G.countries[p.ctrl].short}</span>` : ''}${p.core !== p.owner ? `<br><span class="muted">Исторически: ${G.countries[p.core].short}</span>` : ''}${p.owner !== G.player ? `<br>Отношения: ${relTag(G.rel[G.player][p.owner])}` : ''}${extra}`;
  t.hidden = false;
  const r = $('#mapwrap').getBoundingClientRect();
  t.style.left = Math.min(ev.clientX - r.left + 14, r.width - 250) + 'px'; t.style.top = Math.min(ev.clientY - r.top + 14, r.height - 110) + 'px';
}

// =================== ОБРАБОТЧИКИ ===================
function setPath(obj, path, v) { const ks = path.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks.at(-1)] = v; }
function onInput(e) {
  const k = e.target.dataset.k; if (!k || e.target.type !== 'range') return;
  const C = P(), v = +e.target.value;
  if (k === 'rate' || k === 'printing') C.eco[k] = v; else if (k.startsWith('tp.')) setPath(C, k, v); else setPath(C.eco, k, v);
  const show = document.querySelector(`[data-show="${k}"]`);
  if (show) show.textContent = k.startsWith('spend.') ? pct(v, 1) + (k.includes('sub') ? ' ВВП' : ' · ' + bn(v * C.eco.gdp)) : k === 'printing' ? pct(v) + ' ВВП/год' : k.startsWith('tp.') ? pct(v, 0) : pct(v, k === 'rate' ? 2 : 1);
  const bk = $('#bkpi'); if (bk) bk.innerHTML = budgetKpis(C);
}
function onChange(e) {
  const k = e.target.dataset.k; const C = P(); if (!k) return;
  if (k === 'autoRate') C.eco.autoRate = e.target.checked;
  else if (k === 'mobilized') {
    C.mil.mobilized = e.target.checked;
    if (C.mil.mobilized) { addGroupMod(C, 'workers', -6, 12); addGroupMod(C, 'youth', -10, 12); addGroupMod(C, 'siloviki', 6, 12); log(G, 'Объявлена мобилизация.', 'war'); }
  } else if (k.startsWith('tp.') && e.target.type === 'checkbox') {
    const [, kind, key] = k.match(/^tp\.(\w+)\.(.+)$/);
    if (e.target.checked) C.tp[kind][key] = true; else delete C.tp[kind][key];
    if (kind === 'ban' && e.target.checked) { const g = GOOD[key]; addGroupMod(C, g.cat === 'agri' || key === 'food' ? 'farmers' : 'business', -5, 12); log(G, `Запрет экспорта: ${g.name}.`, 'law'); }
    if (kind === 'emb') { const [gid, cid] = key.split('>'); G.rel[cid][G.player] = Math.max(-100, Math.min(100, G.rel[cid][G.player] + (e.target.checked ? -6 : 3))); if (e.target.checked) log(G, `Эмбарго: ${GOOD[gid].name.toLowerCase()} — ${G.countries[cid].short}.`, 'diplo'); }
    toast('Изменения вступят в силу со следующего месяца');
  } else if (e.target.type !== 'range') return;
  renderHeader(); renderContent();
}
function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const C = P(), id = b.dataset.id, act = b.dataset.act;
  let r = null;
  switch (act) {
    case 'logf': logFilter = id; break;
    case 'inbox': openInbox(); return;
    case 'lawcat': lawCat = id; break;
    case 'gcat': goodCat = id; break;
    case 'gsort': goodSort = { k: id, d: goodSort.k === id ? -goodSort.d : -1 }; break;
    case 'good': sec = 'trade'; detail = { kind: 'good', id, tab: detail?.kind === 'good' ? detail.tab : 'market' }; $('#cbody').scrollTop = 0; break;
    case 'partner': if (id === G.player) return; sec = 'trade'; detail = { kind: 'partner', id }; $('#cbody').scrollTop = 0; break;
    case 'dback': detail = null; break;
    case 'dtab': detail.tab = id; break;
    case 'todiplo': if (id === G.player) return; selC = id; detail = null; sec = 'foreign'; subOf.foreign = 'countries'; break;
    case 'tpreset': delete C.tp.tariff[id]; break;
    case 'pass': r = passLaw(G, C, id); break;
    case 'pass_lobby': r = passLaw(G, C, id, { lobby: true }); break;
    case 'repeal': r = repealLaw(G, C, id); break;
    case 'repeal_lobby': r = repealLaw(G, C, id, { lobby: true }); break;
    case 'selc': selC = id; break;
    case 'diplo': if (id === 'war' && !confirm(`Объявить войну: ${G.countries[selC].name}?`)) return; r = doAction(G, G.player, selC, id); break;
    case 'peace': r = doAction(G, G.player, id, b.dataset.t); break;
    case 'bloc': r = joinBloc(G, G.player, id); break;
    case 'fxint': if (C.eco.reserves < C.eco.gdp * 0.03) r = { ok: false, msg: 'Недостаточно резервов' }; else { C.eco.reserves -= C.eco.gdp * 0.03; C.eco.fxPush = -0.35; r = { ok: true, msg: 'ЦБ продаёт валюту' }; } break;
    case 'decree': r = decree(C, id); break;
  }
  if (r) toast(r.msg || (r.ok ? 'Готово' : 'Невозможно'), r.ok ? 'good' : 'bad');
  renderHeader(); renderContent(); map.update();
  if (G.gameOver) gameOver();
}
function decree(C, id) {
  const pol = C.pol, spend = (pc) => { if (pol.pc < pc) return false; pol.pc -= pc; return true; };
  if (id === 'propaganda') { if (!spend(10)) return { ok: false, msg: 'Нужно 10 ПК' }; for (const g in GROUPS) addGroupMod(C, g, 4, 6); return { ok: true, msg: 'Кампания запущена' }; }
  if (id === 'reshuffle') { if (!spend(25)) return { ok: false, msg: 'Нужно 25 ПК' }; pol.termMonths = Math.max(0, pol.termMonths - 60); pol.gmods = pol.gmods.filter((m) => m.v > 0); log(G, 'Правительство отправлено в отставку, сформирован новый кабинет.', 'law'); return { ok: true, msg: 'Новый кабинет сформирован' }; }
  if (id === 'snap') { if (!spend(15)) return { ok: false, msg: 'Нужно 15 ПК' }; election(G, C); return { ok: true, msg: 'Досрочные выборы проведены' }; }
  if (id.startsWith('pay_')) { const g = id.slice(4); if (!spend(6)) return { ok: false, msg: 'Нужно 6 ПК' }; C.eco.debt += C.eco.gdp * 0.003; addGroupMod(C, g, 12, 12); return { ok: true, msg: `Программа «${GROUPS[g].name}» запущена` }; }
}

// =================== ДОНЕСЕНИЯ ===================
function openInbox(force) { inboxOpen = force ? true : !inboxOpen; renderInbox(); }
function renderInbox() {
  const d = $('#drawer'); d.hidden = !inboxOpen; if (!inboxOpen) return;
  const C = P();
  const items = G.pendingEvents.map((ev, i) => {
    const E = EVENTS[ev.id]; const di = E.def ?? E.choices.length - 1; const left = 3 - (G.turn - (ev.t ?? G.turn));
    const kind = E.global ? 'Мировое событие' : ['proposal', 'peace_offer'].includes(ev.id) ? 'Дипломатия' : ev.id === 'war_declared' ? 'Война' : 'Внутренние дела';
    return `<div class="ev ${ev.id === 'war_declared' ? 'crit' : ''}"><div class="ev-k"><span>${kind}</span><span>${left > 0 ? `осталось ${left} мес.` : 'решится в этом месяце'}</span></div><h4>${E.title(G, C, ev)}</h4><p>${E.text(G, C, ev)}</p>
      <div class="opts">${E.choices.map((c, j) => `<button data-ev="${i}" data-ch="${j}" class="${j === di ? 'def' : ''}">${c.t}${c.hint ? `<small>${c.hint}</small>` : ''}${j === di ? '<small>по умолчанию, если не ответить</small>' : ''}</button>`).join('')}</div></div>`;
  }).join('');
  d.innerHTML = `<div class="drawer-h"><h3>Донесения</h3><button class="btn ghost sm" data-close="1">Закрыть ✕</button></div><div class="drawer-b">${items || '<div class="empty">Новых донесений нет.<br>Игра не останавливается из-за событий — они ждут вас здесь до трёх месяцев.</div>'}
    <label class="row mini" style="margin-top:14px"><input type="checkbox" id="pcrit" ${pref.pauseCrit ? 'checked' : ''}> Ставить паузу, когда на нас нападают</label></div>`;
}
function onInboxClick(e) {
  if (e.target.closest('[data-close]')) { inboxOpen = false; renderInbox(); return; }
  if (e.target.id === 'pcrit') { pref.pauseCrit = e.target.checked; localStorage.setItem('dz_pause_crit', pref.pauseCrit ? '1' : '0'); return; }
  const b = e.target.closest('[data-ev]'); if (!b) return;
  const ev = G.pendingEvents[+b.dataset.ev]; if (!ev) return;
  resolveEvent(G, ev, +b.dataset.ch);
  if (!G.pendingEvents.length) inboxOpen = false;
  renderAll();
  if (G.gameOver) gameOver();
}

// =================== МЕНЮ, ДИАЛОГИ ===================
function tool(t) {
  if (t === 'inbox') return openInbox();
  if (t === 'save') return slotDialog('save');
  if (t === 'load') return slotDialog('load');
  if (t === 'exit') { saveSlot('auto', true).then(showMenu); }
}
async function slotDialog(mode) {
  setSpeed(0);
  const m = $('#modal'); m.hidden = false;
  m.innerHTML = `<div class="mbox"><h2>${mode === 'save' ? 'Сохранить игру' : 'Загрузить игру'}</h2><div class="slots" id="slotlist"><p class="muted">Загрузка…</p></div><div class="actions"><button class="btn" data-x="1">Отмена</button></div></div>`;
  m.onclick = async (e) => {
    if (e.target.closest('[data-x]') || e.target === m) { m.hidden = true; return; }
    const b = e.target.closest('[data-slot]'); if (!b) return;
    m.hidden = true;
    if (mode === 'save') saveSlot(b.dataset.slot); else loadSlot(b.dataset.slot);
  };
  try {
    const { saves } = await api.saves(); const by = Object.fromEntries(saves.map((s) => [s.slot, s]));
    const slots = mode === 'save' ? ['s1', 's2', 's3', 's4', 's5'] : ['auto', 's1', 's2', 's3', 's4', 's5'].filter((s) => by[s]);
    $('#slotlist').innerHTML = slots.map((s) => `<button class="slotbtn" data-slot="${s}"><span><b>${SLOT_NAMES[s]}</b> ${by[s] ? `· ${esc(by[s].country)} · ${esc(by[s].game_date)}` : '<span class="muted">· пусто</span>'}</span><small>${by[s] ? fmtTime(by[s].updated_at) : ''}</small></button>`).join('') || '<p class="muted">Сохранений нет.</p>';
  } catch (e) { $('#slotlist').innerHTML = `<p class="bad">${esc(e.message)}</p>`; }
}
function gameOver() {
  setSpeed(0);
  const C = P(), e = C.eco, g = G.gameOver;
  if (!g.posted) { g.posted = true; api.result({ country: C.short, reason: g.reason, score: g.score, years: G.turn / 12 }).catch(() => {}); saveSlot('auto', true); }
  const m = $('#modal'); m.hidden = false;
  m.innerHTML = `<div class="mbox"><h2>${g.win ? 'История подвела итог' : 'Вы потеряли власть'}</h2><p>${g.text}</p>
    <div class="kv"><div><span>Лет у власти</span><b>${nf(G.turn / 12, 1)}</b></div><div><span>ВВП на душу</span><b>${nf(e.gdppc0 * 1000)} → ${nf(e.gdp / C.pop * 1000)} $</b></div><div><span>Итоговый счёт</span><b>${nf(g.score)}</b></div></div>
    <div class="actions"><button class="btn" data-x="look">Посмотреть на мир</button><button class="btn primary" data-x="menu">В главное меню</button></div></div>`;
  m.onclick = (ev) => { const x = ev.target.closest('[data-x]')?.dataset.x; if (x === 'look') m.hidden = true; if (x === 'menu') { m.hidden = true; showMenu(); } };
}
let toastT;
function toast(msg, kind = '') {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + kind;
  clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), 2800);
}

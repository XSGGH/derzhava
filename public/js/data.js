// ===== Статические данные мира: страны, партии, социальные группы, законы, блоки =====

export const START_YEAR = 2030;
export const END_YEAR = 2055;

export const BLOCS = {
  west: { name: 'Атлантический совет', color: '#4c8dff' },
  east: { name: 'Восточный договор', color: '#ff5d5d' },
  none: { name: 'Неприсоединившиеся', color: '#9aa4b2' },
};

export const GOV = {
  democracy: { name: 'Демократия', freedom: 72, pcBonus: 0, eliteWeight: 1, electionEvery: 48 },
  hybrid: { name: 'Гибридный режим', freedom: 42, pcBonus: 0.6, eliteWeight: 2, electionEvery: 72 },
  autocracy: { name: 'Автократия', freedom: 14, pcBonus: 1.2, eliteWeight: 4, electionEvery: 0 },
};


// Социальные группы. share — доля населения по умолчанию.
export const GROUPS = {
  workers:    { name: 'Рабочие',        icon: '⚒', share: 0.28 },
  farmers:    { name: 'Аграрии',        icon: '🌾', share: 0.10 },
  business:   { name: 'Бизнес',         icon: '💼', share: 0.05, elite: true },
  intel:      { name: 'Интеллигенция',  icon: '📚', share: 0.14 },
  pensioners: { name: 'Пенсионеры',     icon: '👴', share: 0.20 },
  siloviki:   { name: 'Силовики',       icon: '🛡', share: 0.05, elite: true },
  youth:      { name: 'Молодёжь',       icon: '🎓', share: 0.18 },
};

// Партии: econ  -1 левые … +1 правые; soc  -1 либеральные … +1 авторитарные
export const PARTIES = {
  left:  { name: 'Партия Труда',          short: 'ПТ',  color: '#e0473e', econ: -0.8, soc: 0.1,
           aff: { workers: 3, pensioners: 2.2, farmers: 1.6, youth: 1, intel: 0.8, business: 0.2, siloviki: 0.7 } },
  lib:   { name: 'Либеральный союз',      short: 'ЛС',  color: '#f2c14e', econ: 0.75, soc: -0.8,
           aff: { business: 2.6, intel: 3, youth: 2, workers: 0.6, pensioners: 0.4, farmers: 0.4, siloviki: 0.2 } },
  nat:   { name: 'Национальный фронт',    short: 'НФ',  color: '#7a5cff', econ: 0.0, soc: 0.9,
           aff: { siloviki: 3, farmers: 1.6, workers: 1.2, pensioners: 1.2, youth: 0.8, intel: 0.3, business: 0.8 } },
  green: { name: 'Зелёные',               short: 'ЗЛ',  color: '#3fbf6f', econ: -0.3, soc: -0.6,
           aff: { youth: 3, intel: 2, workers: 0.5, pensioners: 0.3, farmers: 0.6, business: 0.3, siloviki: 0.1 } },
  cons:  { name: 'Консервативный блок',   short: 'КБ',  color: '#3aa0d8', econ: 0.5, soc: 0.45,
           aff: { business: 2.2, pensioners: 1.8, farmers: 1.8, siloviki: 1.3, workers: 1, intel: 0.8, youth: 0.5 } },
};

// Страны. sh — доли секторов в ВВП. tax/spend — доли (spend в % ВВП).
const S = (social, health, edu, infra, defense, security, science, agri, ind, tech) =>
  ({ social, health, edu, infra, defense, security, science, subAgri: agri, subInd: ind, subTech: tech });

export const COUNTRIES = [
  { id: 'borea', name: 'Северная Федерация Борея', short: 'Борея', color: '#c0504d', cap: [22, 4], size: 1.8,
    pop: 140, gdppc: 14, gov: 'hybrid', party: 'nat', bloc: 'east', aggr: 0.6, popGrowth: -0.002,
    sh: { agri: 0.05, mining: 0.18, industry: 0.29, services: 0.43, tech: 0.05 },
    res: { oil: 0.8, gas: 0.9, metals: 0.6, coal: 0.7, rare: 0.2, timber: 1 }, corruption: 62, edu: 66, health: 56, infra: 52, science: 48,
    debt: 0.2, deficit: 0.015, open: 0.22, tb: 0.06,
    tax: { inc: 0.13, corp: 0.2, vat: 0.2, res: 0.35, tariff: 0.08 },
    spend: S(0.10, 0.035, 0.04, 0.03, 0.042, 0.026, 0.01, 0.006, 0.006, 0.003),
    laws: ['admin_resource', 'conscription', 'police_state', 'censorship'] },

  { id: 'valdia', name: 'Республика Вальдия', short: 'Вальдия', color: '#4f81bd', cap: [8, 6], size: 1.15,
    pop: 80, gdppc: 52, gov: 'democracy', party: 'cons', bloc: 'west', aggr: 0.1, popGrowth: 0.002,
    sh: { agri: 0.015, mining: 0.01, industry: 0.27, services: 0.6, tech: 0.105 },
    res: { metals: 0.25, coal: 0.5, timber: 0.4 }, corruption: 16, edu: 86, health: 85, infra: 86, science: 78,
    debt: 0.68, deficit: 0.02, open: 0.42, tb: 0.04,
    tax: { inc: 0.3, corp: 0.25, vat: 0.19, res: 0.15, tariff: 0.03 },
    spend: S(0.19, 0.07, 0.05, 0.025, 0.015, 0.015, 0.03, 0.004, 0.005, 0.005),
    laws: ['cb_indep', 'free_press', 'anti_corruption', 'professional_army', 'universal_health', 'tax_progressive'] },

  { id: 'aurelia', name: 'Королевство Аурелия', short: 'Аурелия', color: '#8064a2', cap: [3, 10], size: 0.75,
    pop: 55, gdppc: 47, gov: 'democracy', party: 'lib', bloc: 'west', aggr: 0.15, popGrowth: 0.004,
    sh: { agri: 0.01, mining: 0.02, industry: 0.16, services: 0.72, tech: 0.09 },
    res: { gas: 0.25, oil: 0.2, timber: 0.3 }, corruption: 14, edu: 82, health: 80, infra: 78, science: 70,
    debt: 0.95, deficit: 0.035, open: 0.32, tb: -0.03,
    tax: { inc: 0.28, corp: 0.22, vat: 0.2, res: 0.3, tariff: 0.03 },
    spend: S(0.16, 0.075, 0.045, 0.02, 0.022, 0.017, 0.022, 0.003, 0.003, 0.004),
    laws: ['cb_indep', 'free_press', 'free_trade', 'professional_army', 'universal_health', 'migration_open'] },

  { id: 'ostmark', name: 'Остмарк', short: 'Остмарк', color: '#4bacc6', cap: [13, 5], size: 0.45,
    pop: 12, gdppc: 62, gov: 'democracy', party: 'lib', bloc: 'west', aggr: 0.05, popGrowth: 0.003,
    sh: { agri: 0.02, mining: 0.0, industry: 0.2, services: 0.55, tech: 0.23 },
    res: { timber: 0.3 }, corruption: 8, edu: 92, health: 88, infra: 88, science: 88,
    debt: 0.4, deficit: 0.005, open: 0.55, tb: 0.05,
    tax: { inc: 0.32, corp: 0.2, vat: 0.22, res: 0.1, tariff: 0.02 },
    spend: S(0.17, 0.07, 0.06, 0.025, 0.013, 0.012, 0.035, 0.004, 0.003, 0.008),
    laws: ['cb_indep', 'free_press', 'anti_corruption', 'free_trade', 'science_program', 'professional_army'] },

  { id: 'xandria', name: 'Народная Республика Ксандрия', short: 'Ксандрия', color: '#b03a78', cap: [29, 12], size: 1.55,
    pop: 260, gdppc: 12, gov: 'autocracy', party: 'left', bloc: 'east', aggr: 0.45, popGrowth: 0.001,
    sh: { agri: 0.07, mining: 0.04, industry: 0.39, services: 0.42, tech: 0.08 },
    res: { metals: 0.7, gas: 0.15, coal: 1, rare: 1, timber: 0.4 }, corruption: 50, edu: 72, health: 62, infra: 70, science: 62,
    debt: 0.55, deficit: 0.04, open: 0.3, tb: 0.04,
    tax: { inc: 0.12, corp: 0.25, vat: 0.13, res: 0.3, tariff: 0.07 },
    spend: S(0.08, 0.035, 0.04, 0.05, 0.03, 0.03, 0.025, 0.008, 0.01, 0.008),
    laws: ['nationalization', 'censorship', 'police_state', 'conscription', 'protectionism', 'science_program', 'sez'] },

  { id: 'kargas', name: 'Эмират Каргас', short: 'Каргас', color: '#e8a33c', cap: [17, 15], size: 1.0,
    pop: 35, gdppc: 24, gov: 'autocracy', party: 'cons', bloc: 'none', aggr: 0.3, popGrowth: 0.015,
    sh: { agri: 0.02, mining: 0.42, industry: 0.13, services: 0.4, tech: 0.03 },
    res: { oil: 1.0, gas: 0.4 }, corruption: 55, edu: 58, health: 62, infra: 64, science: 30,
    debt: 0.25, deficit: 0.0, open: 0.45, tb: 0.12,
    tax: { inc: 0.0, corp: 0.1, vat: 0.05, res: 0.55, tariff: 0.05 },
    spend: S(0.08, 0.04, 0.04, 0.04, 0.05, 0.03, 0.006, 0.004, 0.006, 0.003),
    laws: ['nationalization', 'censorship', 'professional_army', 'migration_closed'] },

  { id: 'zarakhan', name: 'Султанат Зарахан', short: 'Зарахан', color: '#9bbb59', cap: [24, 17], size: 0.85,
    pop: 45, gdppc: 15, gov: 'hybrid', party: 'nat', bloc: 'none', aggr: 0.5, popGrowth: 0.012,
    sh: { agri: 0.08, mining: 0.3, industry: 0.18, services: 0.41, tech: 0.03 },
    res: { gas: 1.0, oil: 0.4, metals: 0.15 }, corruption: 62, edu: 52, health: 50, infra: 48, science: 28,
    debt: 0.35, deficit: 0.025, open: 0.38, tb: 0.06,
    tax: { inc: 0.1, corp: 0.18, vat: 0.12, res: 0.45, tariff: 0.09 },
    spend: S(0.07, 0.03, 0.035, 0.03, 0.045, 0.03, 0.005, 0.006, 0.005, 0.002),
    laws: ['admin_resource', 'conscription', 'censorship'] },

  { id: 'mirena', name: 'Республика Мирена', short: 'Мирена', color: '#f79646', cap: [8, 15], size: 0.95,
    pop: 70, gdppc: 8, gov: 'democracy', party: 'left', bloc: 'none', aggr: 0.1, popGrowth: 0.011,
    sh: { agri: 0.22, mining: 0.05, industry: 0.22, services: 0.48, tech: 0.03 },
    res: { metals: 0.35, timber: 0.7, rare: 0.15 }, corruption: 56, edu: 52, health: 50, infra: 40, science: 25,
    debt: 0.62, deficit: 0.04, open: 0.28, tb: -0.03,
    tax: { inc: 0.15, corp: 0.22, vat: 0.16, res: 0.25, tariff: 0.12 },
    spend: S(0.09, 0.04, 0.045, 0.03, 0.015, 0.018, 0.005, 0.012, 0.004, 0.002),
    laws: ['free_press', 'min_wage', 'protectionism', 'land_reform'] },

  { id: 'liorna', name: 'Федерация Лиорна', short: 'Лиорна', color: '#2fa58f', cap: [14, 10], size: 0.95,
    pop: 60, gdppc: 18, gov: 'hybrid', party: 'cons', bloc: 'none', aggr: 0.2, popGrowth: 0.004,
    sh: { agri: 0.1, mining: 0.06, industry: 0.3, services: 0.48, tech: 0.06 },
    res: { metals: 0.45, oil: 0.2, coal: 0.5, timber: 0.5 }, corruption: 42, edu: 68, health: 64, infra: 60, science: 45,
    debt: 0.48, deficit: 0.025, open: 0.35, tb: 0.0,
    tax: { inc: 0.18, corp: 0.2, vat: 0.18, res: 0.3, tariff: 0.06 },
    spend: S(0.12, 0.05, 0.045, 0.03, 0.02, 0.02, 0.012, 0.007, 0.006, 0.004),
    laws: ['admin_resource', 'sez', 'conscription'] },

  { id: 'tarvania', name: 'Тарвания', short: 'Тарвания', color: '#7f6a5a', cap: [21, 10], size: 0.75,
    pop: 30, gdppc: 5, gov: 'autocracy', party: 'nat', bloc: 'east', aggr: 0.7, popGrowth: 0.014,
    sh: { agri: 0.2, mining: 0.22, industry: 0.18, services: 0.37, tech: 0.03 },
    res: { metals: 1.0, oil: 0.2, coal: 0.6, rare: 0.6 }, corruption: 76, edu: 40, health: 38, infra: 32, science: 15,
    debt: 0.7, deficit: 0.045, open: 0.3, tb: 0.02,
    tax: { inc: 0.1, corp: 0.2, vat: 0.15, res: 0.4, tariff: 0.12 },
    spend: S(0.05, 0.02, 0.025, 0.02, 0.045, 0.04, 0.003, 0.006, 0.004, 0.001),
    laws: ['censorship', 'police_state', 'conscription', 'nationalization'] },
];

// ===== Законы и реформы =====
// mods — постоянные эффекты пока закон действует; groups — постоянная надбавка к удовлетворённости
// econ/soc — идеологический вектор (для голосования партий); excl — взаимоисключающая группа
export const LAW_CATS = {
  econ: 'Экономика', fiscal: 'Налоги и соцсфера', state: 'Государство и право', security: 'Оборона и безопасность', society: 'Общество',
};

export const LAWS = [
  // --- Экономика
  { id: 'cb_indep', cat: 'econ', name: 'Независимость Центробанка', pc: 25, econ: 0.5, soc: -0.2,
    desc: 'Ставку определяет ЦБ по правилу Тейлора. Ожидания якорятся, инфляция ниже, но вы теряете ручное управление ставкой.',
    mods: { rateRule: 1, credibility: 0.35, confidence: 6 }, groups: { business: 5, intel: 3 } },
  { id: 'privatization', cat: 'econ', name: 'Приватизация госкомпаний', pc: 30, econ: 0.85, soc: 0, excl: 'ownership',
    desc: 'Разовый доход ~3% ВВП, рост эффективности. При высокой коррупции — олигархизация.',
    mods: { growth: 0.004, confidence: 8, gini: 0.02, corruption: 4 }, onPass: { cash: 0.03 }, groups: { workers: -8, business: 9, pensioners: -3 } },
  { id: 'nationalization', cat: 'econ', name: 'Национализация ключевых отраслей', pc: 30, econ: -0.9, soc: 0.3, excl: 'ownership',
    desc: 'Ресурсная рента уходит в бюджет (+50% ресурсных доходов), но инвесторы бегут.',
    mods: { resRent: 0.5, growth: -0.005, confidence: -15, corruption: 5 }, groups: { workers: 6, business: -15, siloviki: 3 } },
  { id: 'free_trade', cat: 'econ', name: 'Политика свободной торговли', pc: 20, econ: 0.7, soc: -0.2, excl: 'trade',
    desc: 'Открытость экономики +25%, пошлины не выше 4%. Рост эффективности, удар по аграриям.',
    mods: { openness: 0.25, growth: 0.003, tariffCap: 0.04, confidence: 4 }, groups: { farmers: -8, business: 5, workers: -2 } },
  { id: 'protectionism', cat: 'econ', name: 'Протекционизм', pc: 20, econ: -0.4, soc: 0.4, excl: 'trade',
    desc: 'Защита внутреннего рынка: промышленность растёт, но открытость −20% и цены выше.',
    mods: { openness: -0.2, growthInd: 0.005, inflation: 0.008, growth: -0.001 }, groups: { farmers: 6, workers: 4, business: -3 } },
  { id: 'sez', cat: 'econ', name: 'Особые экономические зоны', pc: 15, econ: 0.5, soc: 0,
    desc: 'Налоговые льготы для инвесторов: инвестиции растут, но часть налогов теряется.',
    mods: { invest: 0.02, compliance: -0.03, corruption: 2, growthInd: 0.002 }, groups: { business: 6 } },
  { id: 'green_deal', cat: 'econ', name: 'Зелёный переход', pc: 25, econ: -0.3, soc: -0.4,
    desc: 'Стоит 1% ВВП в год. Технологии растут, добыча сжимается.',
    mods: { spendExtra: 0.01, growthTech: 0.006, growthMining: -0.015, healthT: 4 }, groups: { youth: 8, intel: 5, workers: -3, business: -2 } },
  { id: 'land_reform', cat: 'econ', name: 'Земельная реформа', pc: 15, econ: -0.2, soc: 0,
    desc: 'Передача земли фермерам и кооперативам. Рост сельского хозяйства.',
    mods: { growthAgri: 0.012, gini: -0.01 }, groups: { farmers: 10, business: -3 } },
  { id: 'science_program', cat: 'econ', name: 'Национальная научная программа', pc: 20, econ: -0.1, soc: -0.1,
    desc: 'Гранты, наукограды, венчурные фонды. +0,5% ВВП расходов.',
    mods: { spendExtra: 0.005, sciT: 12, growthTech: 0.005 }, groups: { intel: 7, youth: 3 } },

  // --- Налоги и соцсфера
  { id: 'tax_progressive', cat: 'fiscal', name: 'Прогрессивная шкала НДФЛ', pc: 20, econ: -0.6, soc: 0, excl: 'taxscale',
    desc: 'Богатые платят больше: доходы от НДФЛ +8%, неравенство падает.',
    mods: { incBoost: 0.08, gini: -0.03, invest: -0.005 }, groups: { business: -6, workers: 5, pensioners: 2 } },
  { id: 'flat_tax', cat: 'fiscal', name: 'Плоская шкала налогов', pc: 20, econ: 0.65, soc: 0, excl: 'taxscale',
    desc: 'Простота и собираемость (+6%), но неравенство растёт.',
    mods: { compliance: 0.06, gini: 0.02, invest: 0.005 }, groups: { business: 6, workers: -3 } },
  { id: 'min_wage', cat: 'fiscal', name: 'Высокая минимальная зарплата', pc: 15, econ: -0.6, soc: 0, excl: 'labor',
    desc: 'Снижает бедность, но повышает структурную безработицу.',
    mods: { gini: -0.02, nairu: 0.01 }, groups: { workers: 9, youth: 3, business: -7 } },
  { id: 'labor_flex', cat: 'fiscal', name: 'Гибкий трудовой кодекс', pc: 20, econ: 0.65, soc: 0, excl: 'labor',
    desc: 'Проще нанимать и увольнять: безработица ниже, рабочие недовольны.',
    mods: { nairu: -0.012, gini: 0.01, invest: 0.005 }, groups: { workers: -9, business: 7 } },
  { id: 'pension_reform', cat: 'fiscal', name: 'Повышение пенсионного возраста', pc: 35, econ: 0.5, soc: 0,
    desc: 'Экономит ~1,5% ВВП социальных расходов и расширяет рабочую силу.',
    mods: { socialSave: 0.015, nairu: -0.003, growth: 0.002 }, groups: { pensioners: -16, workers: -5, business: 4 } },
  { id: 'universal_health', cat: 'fiscal', name: 'Всеобщее здравоохранение', pc: 25, econ: -0.6, soc: -0.2,
    desc: 'Единая страховая система: +1% ВВП расходов, здоровье нации растёт.',
    mods: { spendExtra: 0.01, healthT: 12, popGrowth: 0.001 }, groups: { pensioners: 8, workers: 5, business: -2 } },
  { id: 'edu_reform', cat: 'fiscal', name: 'Реформа образования', pc: 20, econ: -0.2, soc: -0.3,
    desc: 'Новые стандарты, бесплатные вузы. +0,5% ВВП расходов.',
    mods: { spendExtra: 0.005, eduT: 10 }, groups: { youth: 8, intel: 5 } },

  // --- Государство и право
  { id: 'free_press', cat: 'state', name: 'Свобода прессы', pc: 20, econ: 0, soc: -0.8, excl: 'press',
    desc: 'Независимые СМИ разоблачают коррупцию, но и ваши провалы.',
    mods: { freedom: 18, corruption: -8, stability: -3 }, groups: { intel: 10, youth: 6, siloviki: -6 } },
  { id: 'censorship', cat: 'state', name: 'Цензура СМИ', pc: 20, econ: 0, soc: 0.85, excl: 'press',
    desc: 'Контроль над информацией: стабильность выше, свобода ниже.',
    mods: { freedom: -18, stability: 7, corruption: 4 }, groups: { intel: -12, youth: -8, siloviki: 6 } },
  { id: 'anti_corruption', cat: 'state', name: 'Антикоррупционное агентство', pc: 30, econ: 0.1, soc: -0.3,
    desc: 'Коррупция медленно снижается на 18 пунктов. Элиты недовольны.',
    mods: { corruption: -18, pcUpkeep: 0.4 }, groups: { intel: 6, business: 2, siloviki: -6, workers: 2 } },
  { id: 'decentralization', cat: 'state', name: 'Децентрализация', pc: 20, econ: 0.2, soc: -0.5,
    desc: 'Регионы получают полномочия и налоги. Инфраструктура строится эффективнее.',
    mods: { infraT: 8, freedom: 6, stability: -3 }, groups: { intel: 3, farmers: 3, siloviki: -3 } },
  { id: 'admin_resource', cat: 'state', name: 'Административный ресурс', pc: 15, econ: 0, soc: 0.7, notGov: 'democracy',
    desc: 'Давление на избирателей и комиссии: +8 п.п. правящей партии на выборах.',
    mods: { electionBonus: 0.08, freedom: -8, corruption: 3 }, groups: { intel: -8, youth: -5 } },
  { id: 'reg_democracy', cat: 'state', name: 'Демократизация', pc: 45, econ: 0, soc: -1, excl: 'regime', regime: 'democracy',
    desc: 'Честные выборы каждые 4 года, сильный парламент. Политкапитал копится медленнее.',
    mods: { stability: -6, confidence: 5 }, groups: { intel: 12, youth: 10, siloviki: -10, business: 2 } },
  { id: 'reg_hybrid', cat: 'state', name: 'Суперпрезидентская республика', pc: 45, econ: 0, soc: 0.6, excl: 'regime', regime: 'hybrid',
    desc: 'Выборы раз в 6 лет, президент сильнее парламента.',
    mods: {}, groups: { siloviki: 4, intel: -6 } },
  { id: 'reg_autocracy', cat: 'state', name: 'Режим личной власти', pc: 60, econ: 0, soc: 1, excl: 'regime', regime: 'autocracy',
    desc: 'Выборы отменены. Парламент штампует законы. Опора — элиты и силовики. Риск переворота и революции.',
    mods: { stability: 5, confidence: -8 }, groups: { intel: -18, youth: -12, siloviki: 8 } },

  // --- Оборона и безопасность
  { id: 'police_state', cat: 'security', name: 'Расширение полномочий силовиков', pc: 25, econ: 0, soc: 0.9,
    desc: 'Протесты подавляются в зародыше. Стабильность +10, свобода −12.',
    mods: { stability: 10, freedom: -12 }, groups: { siloviki: 10, intel: -10, youth: -6 } },
  { id: 'conscription', cat: 'security', name: 'Всеобщий призыв', pc: 20, econ: -0.1, soc: 0.6, excl: 'army',
    desc: 'Больше солдат (×1,5 мобилизационный ресурс), но молодёжь против.',
    mods: { manpower: 0.5, nairu: -0.004 }, groups: { youth: -9, siloviki: 7 } },
  { id: 'professional_army', cat: 'security', name: 'Контрактная армия', pc: 20, econ: 0.2, soc: -0.1, excl: 'army',
    desc: 'Меньше людей, но качество войск ×1,3.',
    mods: { milQuality: 0.3, manpower: -0.15 }, groups: { youth: 5, siloviki: 2 } },

  // --- Общество
  { id: 'migration_open', cat: 'society', name: 'Открытая миграция', pc: 20, econ: 0.3, soc: -0.7, excl: 'migration',
    desc: 'Рост населения +0,6%/год, дефицит кадров уходит. Националисты в ярости.',
    mods: { popGrowth: 0.006, nairu: -0.003 }, groups: { workers: -6, business: 6, intel: 3, siloviki: -4 } },
  { id: 'migration_closed', cat: 'society', name: 'Жёсткий миграционный режим', pc: 15, econ: -0.1, soc: 0.7, excl: 'migration',
    desc: 'Мигрантов почти нет: рабочие довольны, бизнес теряет кадры.',
    mods: { popGrowth: -0.003, growth: -0.001 }, groups: { workers: 4, siloviki: 3, business: -4, intel: -3 } },
  { id: 'family_support', cat: 'society', name: 'Материнский капитал и семейные пособия', pc: 15, econ: -0.4, soc: 0.3,
    desc: '+0,6% ВВП расходов, рождаемость растёт.',
    mods: { spendExtra: 0.006, popGrowth: 0.003, gini: -0.005 }, groups: { workers: 4, pensioners: 2, youth: 3 } },
];
export const LAW_BY_ID = Object.fromEntries(LAWS.map((l) => [l.id, l]));

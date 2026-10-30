// ===== Товары, межотраслевой баланс, отраслевая специализация стран =====
// Объёмы — в млрд $ в год по базовым ценам; цена — индекс (1 = уровень 2030), base — цена для отображения.

export const GOOD_CATS = {
  raw: { name: 'Сырьё и энергия', color: '#c77d3a' },
  agri: { name: 'Сельское хозяйство', color: '#7fb24a' },
  industry: { name: 'Промышленность', color: '#4c8dff' },
  tech: { name: 'Высокие технологии', color: '#b78cff' },
  services: { name: 'Торгуемые услуги', color: '#3fc1c9' },
};

// fd — базовая доля конечного спроса в ВВП (до калибровки); inc — эластичность по доходу; el — ценовая эластичность
export const GOODS = [
  { id: 'oil', name: 'Нефть', cat: 'raw', unit: '$/барр', base: 80, res: 'oil', rw: 1.0, fd: 0.004, el: 0.15, icon: '🛢' },
  { id: 'gas', name: 'Природный газ', cat: 'raw', unit: '$/тыс.м³', base: 300, res: 'gas', rw: 0.9, fd: 0.012, el: 0.15, icon: '🔥' },
  { id: 'coal', name: 'Уголь', cat: 'raw', unit: '$/т', base: 120, res: 'coal', rw: 0.35, fd: 0.004, el: 0.3, icon: '⬛' },
  { id: 'iron', name: 'Железная руда', cat: 'raw', unit: '$/т', base: 110, res: 'iron', rw: 0.45, fd: 0, el: 0.3, icon: '🪨' },
  { id: 'copper', name: 'Медь', cat: 'raw', unit: '$/т', base: 9000, res: 'copper', rw: 0.5, fd: 0, el: 0.3, icon: '🟠' },
  { id: 'rare', name: 'Редкоземельные металлы', cat: 'raw', unit: '$/кг', base: 60, res: 'rare', rw: 0.35, fd: 0, el: 0.45, icon: '💎' },
  { id: 'timber', name: 'Лес и древесина', cat: 'raw', unit: '$/м³', base: 90, res: 'timber', rw: 0.25, fd: 0.004, el: 0.5, icon: '🌲' },

  { id: 'grain', name: 'Зерно', cat: 'agri', unit: '$/т', base: 250, fd: 0.008, inc: -0.3, el: 0.15, icon: '🌾' },
  { id: 'meat', name: 'Мясо и молоко', cat: 'agri', unit: '$/т', base: 4500, fd: 0.016, inc: 0.25, el: 0.4, icon: '🥩' },
  { id: 'fruit', name: 'Овощи и фрукты', cat: 'agri', unit: '$/т', base: 900, fd: 0.014, inc: 0.1, el: 0.4, icon: '🍎' },
  { id: 'cotton', name: 'Хлопок и волокна', cat: 'agri', unit: '$/т', base: 1800, fd: 0, el: 0.4, icon: '🧶' },

  { id: 'fuel', name: 'Нефтепродукты', cat: 'industry', unit: '$/т', base: 750, fd: 0.022, el: 0.2, icon: '⛽' },
  { id: 'steel', name: 'Сталь и прокат', cat: 'industry', unit: '$/т', base: 700, fd: 0.002, el: 0.4, icon: '🔩' },
  { id: 'chem', name: 'Химия и удобрения', cat: 'industry', unit: 'индекс', base: 100, fd: 0.006, el: 0.4, icon: '⚗' },
  { id: 'machinery', name: 'Станки и оборудование', cat: 'industry', unit: 'индекс', base: 100, fd: 0.02, inc: 0.1, el: 0.6, icon: '⚙', invest: true },
  { id: 'cars', name: 'Автомобили', cat: 'industry', unit: 'тыс.$/шт', base: 30, fd: 0.026, inc: 0.4, el: 0.9, icon: '🚗' },
  { id: 'textiles', name: 'Текстиль и одежда', cat: 'industry', unit: 'индекс', base: 100, fd: 0.02, inc: -0.1, el: 0.6, icon: '👕' },
  { id: 'consumer', name: 'Потребительские товары', cat: 'industry', unit: 'индекс', base: 100, fd: 0.04, inc: 0.1, el: 0.6, icon: '🧴' },
  { id: 'food', name: 'Продукты питания', cat: 'industry', unit: 'индекс', base: 100, fd: 0.05, inc: -0.05, el: 0.2, icon: '🥫' },
  { id: 'arms', name: 'Вооружение', cat: 'industry', unit: 'индекс', base: 100, fd: 0, el: 0.3, icon: '🎯', arms: true },

  { id: 'electronics', name: 'Электроника', cat: 'tech', unit: 'индекс', base: 100, fd: 0.03, inc: 0.3, el: 0.8, icon: '📱' },
  { id: 'chips', name: 'Микрочипы', cat: 'tech', unit: 'индекс', base: 100, fd: 0.002, el: 0.3, icon: '🔲' },
  { id: 'pharma', name: 'Лекарства', cat: 'tech', unit: 'индекс', base: 100, fd: 0.02, inc: 0.3, el: 0.2, icon: '💊' },

  { id: 'finance', name: 'Финансы и IT-услуги', cat: 'services', unit: 'индекс', base: 100, fd: 0.025, inc: 0.5, el: 0.6, icon: '💹' },
  { id: 'tourism', name: 'Туризм', cat: 'services', unit: 'индекс', base: 100, fd: 0.018, inc: 0.5, el: 0.9, icon: '🏖' },
];
export const GOOD = Object.fromEntries(GOODS.map((g) => [g.id, g]));
export const SECTOR_OF = { raw: 'mining', agri: 'agri', industry: 'industry', tech: 'tech', services: 'services' };

// Межотраслевой баланс: IO[выход] = { вход: затраты на единицу выпуска }
export const IO = {
  oil: { machinery: 0.04, fuel: 0.02 }, gas: { machinery: 0.04 }, coal: { machinery: 0.05, fuel: 0.03 },
  iron: { machinery: 0.05, fuel: 0.03 }, copper: { machinery: 0.05, fuel: 0.03 }, rare: { machinery: 0.05, chem: 0.04 }, timber: { fuel: 0.04, machinery: 0.03 },
  grain: { chem: 0.08, fuel: 0.05, machinery: 0.03 }, meat: { grain: 0.25, pharma: 0.01, fuel: 0.02 }, fruit: { chem: 0.05, fuel: 0.04 }, cotton: { chem: 0.07, fuel: 0.03 },
  fuel: { oil: 0.55 }, steel: { iron: 0.28, coal: 0.18, gas: 0.04 }, chem: { gas: 0.22, oil: 0.12 },
  machinery: { steel: 0.22, electronics: 0.08, copper: 0.05 }, cars: { steel: 0.18, electronics: 0.08, chem: 0.05, chips: 0.03, copper: 0.03 },
  textiles: { cotton: 0.3, chem: 0.05 }, consumer: { chem: 0.1, textiles: 0.04, timber: 0.05, electronics: 0.04 },
  food: { grain: 0.22, meat: 0.2, fruit: 0.12 }, arms: { steel: 0.18, electronics: 0.12, chips: 0.06, chem: 0.04 },
  electronics: { chips: 0.22, copper: 0.07, rare: 0.06, chem: 0.03 }, chips: { rare: 0.08, chem: 0.08, gas: 0.02 }, pharma: { chem: 0.22 },
  finance: {}, tourism: { fuel: 0.04, food: 0.05 },
};
// Где используется товар (обратный индекс)
export const USED_IN = {};
for (const [out, ins] of Object.entries(IO)) for (const [inp, a] of Object.entries(ins)) (USED_IN[inp] ||= []).push([out, a]);

// Специализация по отраслям (доли внутри сектора); по умолчанию + переопределения стран
const DEF_IND = { fuel: 0.12, steel: 0.13, chem: 0.12, machinery: 0.13, cars: 0.13, textiles: 0.08, consumer: 0.13, food: 0.12, arms: 0.04 };
const DEF_TECH = { electronics: 0.45, chips: 0.15, pharma: 0.4 };
const DEF_SERV = { finance: 0.06, tourism: 0.035 };
export const MIX = {
  borea: { ind: { fuel: 0.26, steel: 0.18, chem: 0.13, machinery: 0.08, cars: 0.05, textiles: 0.02, consumer: 0.05, food: 0.1, arms: 0.13 }, tech: { electronics: 0.3, chips: 0.1, pharma: 0.6 }, serv: { finance: 0.02, tourism: 0.015 } },
  valdia: { ind: { fuel: 0.05, steel: 0.07, chem: 0.17, machinery: 0.25, cars: 0.28, textiles: 0.02, consumer: 0.07, food: 0.07, arms: 0.02 }, tech: { electronics: 0.3, chips: 0.15, pharma: 0.55 }, serv: { finance: 0.07, tourism: 0.03 } },
  aurelia: { ind: { fuel: 0.08, steel: 0.04, chem: 0.15, machinery: 0.12, cars: 0.1, textiles: 0.06, consumer: 0.2, food: 0.15, arms: 0.1 }, tech: { electronics: 0.25, chips: 0.1, pharma: 0.65 }, serv: { finance: 0.13, tourism: 0.05 } },
  ostmark: { ind: { fuel: 0.02, steel: 0.03, chem: 0.15, machinery: 0.42, cars: 0.05, textiles: 0.02, consumer: 0.12, food: 0.12, arms: 0.07 }, tech: { electronics: 0.3, chips: 0.5, pharma: 0.2 }, serv: { finance: 0.1, tourism: 0.04 } },
  xandria: { ind: { fuel: 0.07, steel: 0.17, chem: 0.12, machinery: 0.12, cars: 0.1, textiles: 0.13, consumer: 0.18, food: 0.08, arms: 0.03 }, tech: { electronics: 0.62, chips: 0.2, pharma: 0.18 }, serv: { finance: 0.02, tourism: 0.02 } },
  kargas: { ind: { fuel: 0.42, steel: 0.04, chem: 0.32, machinery: 0.02, cars: 0.01, textiles: 0.03, consumer: 0.06, food: 0.09, arms: 0.01 }, tech: { electronics: 0.3, chips: 0.05, pharma: 0.65 }, serv: { finance: 0.06, tourism: 0.08 } },
  zarakhan: { ind: { fuel: 0.22, steel: 0.06, chem: 0.36, machinery: 0.03, cars: 0.02, textiles: 0.08, consumer: 0.06, food: 0.13, arms: 0.04 }, tech: { electronics: 0.3, chips: 0.05, pharma: 0.65 }, serv: { finance: 0.02, tourism: 0.06 } },
  mirena: { ind: { fuel: 0.05, steel: 0.05, chem: 0.07, machinery: 0.03, cars: 0.04, textiles: 0.32, consumer: 0.12, food: 0.3, arms: 0.02 }, tech: { electronics: 0.4, chips: 0.05, pharma: 0.55 }, serv: { finance: 0.015, tourism: 0.07 } },
  liorna: { ind: { fuel: 0.08, steel: 0.15, chem: 0.1, machinery: 0.18, cars: 0.2, textiles: 0.04, consumer: 0.08, food: 0.15, arms: 0.02 }, tech: { electronics: 0.4, chips: 0.1, pharma: 0.5 }, serv: { finance: 0.03, tourism: 0.04 } },
  tarvania: { ind: { fuel: 0.06, steel: 0.36, chem: 0.05, machinery: 0.04, cars: 0.01, textiles: 0.06, consumer: 0.05, food: 0.22, arms: 0.15 }, tech: { electronics: 0.2, chips: 0.05, pharma: 0.75 }, serv: { finance: 0.01, tourism: 0.02 } },
};
export function mixFor(id) {
  const m = MIX[id] || {};
  return { ind: { ...DEF_IND, ...m.ind }, tech: { ...DEF_TECH, ...m.tech }, serv: { ...DEF_SERV, ...m.serv } };
}

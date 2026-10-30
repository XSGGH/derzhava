// Безголовый прогон симуляции: проверка устойчивости (нет NaN, разумные величины)
import { createWorld } from '../public/js/world.js';
import { step } from '../public/js/sim.js';
import { resolveEvent } from '../public/js/events.js';

const player = process.argv[2] || 'liorna';
const years = +(process.argv[3] || 25);
const G = createWorld(player, { seed: +(process.argv[4] || 42) });
const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : 'NaN');
function report() {
  console.log(`\n=== ${G.year}-${G.month + 1}  oil ${f(G.markets.oil.price)} gas ${f(G.markets.gas.price)} met ${f(G.markets.metals.price)} grain ${f(G.markets.grain.price)} wars ${G.wars.length}`);
  for (const C of Object.values(G.countries)) {
    const e = C.eco;
    console.log(`${C.short.padEnd(9)} ${C.alive ? ' ' : '✝'} gdp ${f(e.gdp, 0).padStart(6)} pc ${f(e.gdp / C.pop).padStart(5)} g ${f(e.growth * 100).padStart(5)}% inf ${f(e.infl * 100).padStart(5)}% u ${f(e.unemp * 100).padStart(4)}% r ${f(e.rate * 100).padStart(4)} def ${f((e.budget.deficitGdp || 0) * 100).padStart(5)} debt ${f(e.debt / e.gdp * 100, 0).padStart(4)}% fx ${f(e.fx, 0).padStart(4)} tb ${f(e.tbLag * 100).padStart(5)} appr ${f(C.pol.approval, 0)} stab ${f(C.pol.stability, 0)} pc ${f(C.pol.pc, 0)} ${C.gov[0]} ${C.party} ${e.rating}`);
  }
}
report();
for (let t = 0; t < years * 12; t++) {
  step(G);
  while (G.pendingEvents.length) resolveEvent(G, G.pendingEvents[0], 0);
  if (G.gameOver) { console.log('GAME OVER', G.gameOver); break; }
  if (G.month === 0 && G.year % 5 === 0) report();
  for (const C of Object.values(G.countries)) if (!Number.isFinite(C.eco.gdp) || !Number.isFinite(C.eco.infl)) { console.log('NaN in', C.id, t); report(); process.exit(1); }
}
report();
console.log('\nПоследние события:'); for (const l of G.log.slice(0, 25)) console.log(l.d, '-', l.text);
console.log('\nКлючевое:'); for (const l of G.log.filter((l) => /войн|Мир|аннекс|переворот|революц|прекращает|дефолт|выборы проиграны/i.test(l.text))) console.log(l.d, '-', l.text);

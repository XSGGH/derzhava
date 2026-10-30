// ===== Держава: веб-сервер (статика + API аккаунтов и сохранений) =====
import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, migrate } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8080);
const SESSION_DAYS = 60;
const COOKIE = 'dz_sid';

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));

// ---------- утилиты ----------
const parseCookies = (h = '') => Object.fromEntries(h.split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const emailOk = (e) => typeof e === 'string' && e.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const SLOT_RE = /^(auto|s[1-5])$/;
const err = (res, code, msg) => res.status(code).json({ error: msg });

function setSession(req, res, token) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`);
}
async function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`, [token, userId]);
  await pool.query('UPDATE users SET last_login = now() WHERE id = $1', [userId]);
  setSession(req, res, token);
}
async function auth(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return err(res, 401, 'Нужно войти');
  const { rows } = await pool.query('SELECT u.id, u.email, u.nickname FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND s.expires_at > now()', [token]);
  if (!rows[0]) return err(res, 401, 'Сессия истекла');
  req.user = rows[0]; req.token = token;
  next();
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => { console.error(e); err(res, 500, 'Ошибка сервера'); });

// простая защита от перебора паролей
const attempts = new Map();
function throttle(req, res, next) {
  const k = req.ip, now = Date.now();
  const a = (attempts.get(k) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (a.length >= 30) return err(res, 429, 'Слишком много попыток. Подождите 10 минут.');
  a.push(now); attempts.set(k, a); next();
}

// ---------- аккаунты ----------
app.post('/api/register', throttle, wrap(async (req, res) => {
  let { email, password, nickname } = req.body || {};
  email = String(email || '').trim().toLowerCase();
  nickname = String(nickname || '').trim().slice(0, 24) || email.split('@')[0].slice(0, 24);
  if (!emailOk(email)) return err(res, 400, 'Некорректная почта');
  if (typeof password !== 'string' || password.length < 6) return err(res, 400, 'Пароль — минимум 6 символов');
  if (password.length > 200) return err(res, 400, 'Слишком длинный пароль');
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query('INSERT INTO users (email, nickname, pass_hash) VALUES ($1, $2, $3) RETURNING id, email, nickname', [email, nickname, hash]);
    await createSession(req, res, rows[0].id);
    res.json({ user: rows[0] });
  } catch (e) {
    if (e.code === '23505') return err(res, 409, 'Эта почта уже зарегистрирована');
    throw e;
  }
}));

app.post('/api/login', throttle, wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const { rows } = await pool.query('SELECT id, email, nickname, pass_hash FROM users WHERE email = $1', [email]);
  if (!rows[0] || !(await bcrypt.compare(password, rows[0].pass_hash))) return err(res, 401, 'Неверная почта или пароль');
  await createSession(req, res, rows[0].id);
  res.json({ user: { id: rows[0].id, email: rows[0].email, nickname: rows[0].nickname } });
}));

app.post('/api/logout', wrap(async (req, res) => {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
}));

app.get('/api/me', wrap(auth), (req, res) => res.json({ user: req.user }));

// ---------- сохранения ----------
app.get('/api/saves', wrap(auth), wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT slot, name, country, game_date, score, size, updated_at FROM saves WHERE user_id = $1 ORDER BY updated_at DESC', [req.user.id]);
  res.json({ saves: rows });
}));

app.get('/api/saves/:slot', wrap(auth), wrap(async (req, res) => {
  if (!SLOT_RE.test(req.params.slot)) return err(res, 400, 'Неверный слот');
  const { rows } = await pool.query('SELECT data FROM saves WHERE user_id = $1 AND slot = $2', [req.user.id, req.params.slot]);
  if (!rows[0]) return err(res, 404, 'Сохранение не найдено');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(zlib.gunzipSync(rows[0].data));
}));

app.put('/api/saves/:slot', wrap(auth), wrap(async (req, res) => {
  const slot = req.params.slot;
  if (!SLOT_RE.test(slot)) return err(res, 400, 'Неверный слот');
  const { name = '', country = '', gameDate = '', score = null, data } = req.body || {};
  if (!data || typeof data !== 'object') return err(res, 400, 'Нет данных');
  const raw = Buffer.from(JSON.stringify(data));
  const gz = zlib.gzipSync(raw, { level: 6 });
  await pool.query(`INSERT INTO saves (user_id, slot, name, country, game_date, score, data, size, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
    ON CONFLICT (user_id, slot) DO UPDATE SET name = EXCLUDED.name, country = EXCLUDED.country, game_date = EXCLUDED.game_date,
      score = EXCLUDED.score, data = EXCLUDED.data, size = EXCLUDED.size, updated_at = now()`,
  [req.user.id, slot, String(name).slice(0, 80), String(country).slice(0, 40), String(gameDate).slice(0, 40), Number.isFinite(score) ? Math.round(score) : null, gz, gz.length]);
  res.json({ ok: true, size: gz.length });
}));

app.delete('/api/saves/:slot', wrap(auth), wrap(async (req, res) => {
  if (!SLOT_RE.test(req.params.slot)) return err(res, 400, 'Неверный слот');
  await pool.query('DELETE FROM saves WHERE user_id = $1 AND slot = $2', [req.user.id, req.params.slot]);
  res.json({ ok: true });
}));

// ---------- результаты и рекорды ----------
app.post('/api/results', wrap(auth), wrap(async (req, res) => {
  const { country, reason, score, years } = req.body || {};
  if (!Number.isFinite(score)) return err(res, 400, 'Нет счёта');
  await pool.query('INSERT INTO results (user_id, country, reason, score, years) VALUES ($1, $2, $3, $4, $5)',
    [req.user.id, String(country || '').slice(0, 40), String(reason || '').slice(0, 40), Math.round(score), Number(years) || 0]);
  res.json({ ok: true });
}));

app.get('/api/leaderboard', wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT u.nickname, r.country, r.reason, r.score, r.years, r.created_at
    FROM results r JOIN users u ON u.id = r.user_id ORDER BY r.score DESC LIMIT 20`);
  res.json({ results: rows });
}));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------- статика ----------
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', index: 'index.html' }));
app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

migrate().then(() => app.listen(PORT, () => console.log(`[derzhava] слушаю порт ${PORT}`))).catch((e) => { console.error('[db] не удалось подключиться:', e); process.exit(1); });

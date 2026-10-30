// ===== PostgreSQL: подключение и автоматическая миграция =====
import pg from 'pg';

const url = process.env.DATABASE_URL
  || `postgres://${process.env.POSTGRES_USER || 'derzhava'}:${encodeURIComponent(process.env.POSTGRES_PASSWORD || 'derzhava')}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || 'derzhava'}`;

export const pool = new pg.Pool({ connectionString: url, max: 10 });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  nickname    TEXT NOT NULL,
  pass_hash   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login  TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS saves (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot        TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  country     TEXT NOT NULL DEFAULT '',
  game_date   TEXT NOT NULL DEFAULT '',
  score       INTEGER,
  data        BYTEA NOT NULL,
  size        INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slot)
);
CREATE TABLE IF NOT EXISTS results (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  country     TEXT NOT NULL,
  reason      TEXT NOT NULL,
  score       INTEGER NOT NULL,
  years       REAL NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function migrate() {
  // ждём, пока поднимется контейнер с базой
  for (let i = 1; ; i++) {
    try { await pool.query('SELECT 1'); break; } catch (e) {
      if (i >= 60) throw e;
      console.log(`[db] база недоступна (${e.code || e.message}), попытка ${i}/60…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await pool.query(SCHEMA);
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
  console.log('[db] схема готова');
}

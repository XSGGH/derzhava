// ===== Клиент API =====
async function req(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  let data = null;
  try { data = await r.json(); } catch { /* пусто */ }
  if (!r.ok) throw new Error(data?.error || `Ошибка ${r.status}`);
  return data;
}
export const api = {
  me: () => req('GET', '/api/me'),
  register: (email, password, nickname) => req('POST', '/api/register', { email, password, nickname }),
  login: (email, password) => req('POST', '/api/login', { email, password }),
  logout: () => req('POST', '/api/logout'),
  saves: () => req('GET', '/api/saves'),
  load: (slot) => req('GET', '/api/saves/' + slot),
  save: (slot, meta, data) => req('PUT', '/api/saves/' + slot, { ...meta, data }),
  del: (slot) => req('DELETE', '/api/saves/' + slot),
  result: (r) => req('POST', '/api/results', r),
  leaderboard: () => req('GET', '/api/leaderboard'),
};

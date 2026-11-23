import { createServer } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const port = Number(process.env.PORT || 8080);
const adminToken = process.env.NEWSROOM_ADMIN_TOKEN || '';
const expoAccessToken = process.env.EXPO_ACCESS_TOKEN || '';
const stateFile = process.env.STATE_FILE || './data/devices.json';
const maxBody = 32 * 1024;
const rate = new Map();

if (!adminToken || adminToken.length < 32) throw new Error('NEWSROOM_ADMIN_TOKEN must be a random secret of at least 32 characters.');
let devices = new Map();
try { devices = new Map(JSON.parse(await readFile(stateFile, 'utf8')).map((item) => [item.token, item])); } catch { /* First start. */ }
let persistQueue = Promise.resolve();
async function persist() {
  const snapshot = JSON.stringify([...devices.values()]);
  const operation = persistQueue.catch(() => undefined).then(async () => {
    const { mkdir } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    await mkdir(dirname(stateFile), { recursive: true });
    const temp = `${stateFile}.${randomUUID()}.tmp`;
    await writeFile(temp, snapshot, { mode: 0o600 });
    await rename(temp, stateFile);
  });
  persistQueue = operation;
  return operation;
}
function tokenValid(candidate) {
  if (!candidate || candidate.length !== adminToken.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(adminToken));
}
function send(res, status, body) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }
async function bodyOf(req) {
  let raw = ''; for await (const part of req) { raw += part; if (Buffer.byteLength(raw) > maxBody) throw new Error('Request body too large.'); }
  try { return JSON.parse(raw || '{}'); } catch { throw new Error('Invalid JSON.'); }
}
function validExpoToken(token) { return typeof token === 'string' && /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/.test(token); }
function cleanPrefs(input) {
  const categories = Array.isArray(input.categories) ? input.categories.filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 100) : [];
  const lga = typeof input.lga === 'string' && /^[A-Za-z ]{1,40}$/.test(input.lga) ? input.lga : 'all';
  return { enabled: input.enabled === true, breaking: input.breaking === true, major: input.major === true,
    local: input.local === true, categories: [...new Set(categories)], lga };
}
function rateLimited(req) {
  const ip = req.socket.remoteAddress || 'unknown'; const now = Date.now();
  const entry = rate.get(ip) || { start: now, count: 0 };
  if (now - entry.start > 60_000) { entry.start = now; entry.count = 0; }
  entry.count += 1; rate.set(ip, entry); return entry.count > 90;
}
async function sendPush(messages) {
  const receiptTokens = new Map();
  for (let i = 0; i < messages.length; i += 100) {
    const headers = { 'content-type': 'application/json' };
    if (expoAccessToken) headers.authorization = `Bearer ${expoAccessToken}`;
    const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers, body: JSON.stringify(messages.slice(i, i + 100)) });
    if (!response.ok) throw new Error(`Expo push API responded ${response.status}.`);
    const { data } = await response.json();
    for (let n = 0; n < data.length; n++) {
      const ticket = data[n]; const message = messages[i + n];
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') devices.delete(message.to);
      if (ticket.status === 'ok' && ticket.id) receiptTokens.set(ticket.id, message.to);
    }
  }
  await persist();
  if (receiptTokens.size) {
    const timer = setTimeout(() => { void checkReceipts(receiptTokens); }, 15 * 60 * 1000);
    timer.unref();
  }
}
async function checkReceipts(receiptTokens) {
  const ids = [...receiptTokens.keys()];
  for (let i = 0; i < ids.length; i += 300) {
    try {
      const headers = { 'content-type': 'application/json' };
      if (expoAccessToken) headers.authorization = `Bearer ${expoAccessToken}`;
      const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', { method: 'POST', headers, body: JSON.stringify({ ids: ids.slice(i, i + 300) }) });
      if (!response.ok) continue;
      const { data = {} } = await response.json();
      for (const [ticketId, receipt] of Object.entries(data)) {
        if (receipt?.status === 'error' && receipt?.details?.error === 'DeviceNotRegistered') devices.delete(receiptTokens.get(ticketId));
      }
    } catch { /* Expo receipts can be checked again by the next alert; the ticket result is retained by Expo. */ }
  }
  await persist();
}

createServer(async (req, res) => {
  if (rateLimited(req)) return send(res, 429, { error: 'Too many requests.' });
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true });
  try {
    if (req.method === 'POST' && path === '/register') {
      const input = await bodyOf(req);
      if (!validExpoToken(input.token)) return send(res, 400, { error: 'Invalid Expo push token.' });
      const old = devices.get(input.token) || {};
      devices.set(input.token, { ...old, token: input.token, platform: ['ios', 'android'].includes(input.platform) ? input.platform : 'unknown', ...cleanPrefs(input) });
      await persist(); return send(res, 200, { ok: true });
    }
    if (req.method === 'PUT' && path === '/preferences') {
      const input = await bodyOf(req);
      if (!validExpoToken(input.token) || !devices.has(input.token)) return send(res, 404, { error: 'Device registration not found.' });
      devices.set(input.token, { ...devices.get(input.token), ...cleanPrefs(input) });
      await persist(); return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && path === '/newsroom/alert') {
      const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
      if (!tokenValid(bearer)) return send(res, 401, { error: 'Unauthorized.' });
      const input = await bodyOf(req);
      const kind = input.kind;
      if (!['breaking', 'major', 'local'].includes(kind)) return send(res, 400, { error: 'kind must be breaking, major, or local.' });
      if (!Number.isSafeInteger(input.articleId) || input.articleId < 1 || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 180) return send(res, 400, { error: 'A valid articleId and title (max 180 chars) are required.' });
      if (input.categoryId != null && (!Number.isSafeInteger(input.categoryId) || input.categoryId < 1)) return send(res, 400, { error: 'Invalid categoryId.' });
      if (kind === 'local' && (typeof input.lga !== 'string' || !/^[A-Za-z ]{1,40}$/.test(input.lga))) return send(res, 400, { error: 'Local alerts require a valid lga.' });
      const url = `https://nasarawanewsline.com.ng/?p=${input.articleId}`;
      const selected = [...devices.values()].filter((d) => d.enabled && d[kind] &&
        (!input.categoryId || !d.categories.length || d.categories.includes(input.categoryId)) &&
        (kind !== 'local' || d.lga === 'all' || d.lga === input.lga));
      const messages = selected.map((device) => ({ to: device.token, sound: 'default', channelId: 'news', title: input.title.trim(),
        body: typeof input.body === 'string' ? input.body.slice(0, 220) : 'Tap to read this important update.',
        data: { articleId: input.articleId, url, kind, categoryId: input.categoryId || null, lga: input.lga || null } }));
      await sendPush(messages); return send(res, 200, { ok: true, matchedDevices: selected.length, submitted: messages.length });
    }
    return send(res, 404, { error: 'Not found.' });
  } catch (error) { return send(res, 400, { error: error instanceof Error ? error.message : 'Request failed.' }); }
}).listen(port, '0.0.0.0', () => console.log(`Newsline push service listening on ${port}`));

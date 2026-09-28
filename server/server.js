const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, hashPassword, isUsingDefaultPassword } = require('./db');
const { renderIndex } = require('./render');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ADMIN_DIR = path.join(__dirname, '..', 'admin');
const BUNDLED_UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
// UPLOADS_DIR lets uploaded photos live outside the code folder (persistent disk)
const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : BUNDLED_UPLOADS_DIR;
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let ADMIN_ENABLED = process.env.ADMIN_ENABLED === 'true';
if (ADMIN_ENABLED && IS_PROD && isUsingDefaultPassword()) {
  ADMIN_ENABLED = false;
  console.warn('WARNING: admin panel DISABLED - the admin account still uses the default password. ' +
    'Set ADMIN_PASSWORD in the server environment and restart.');
}

// ---- very small session store (in-memory) ----
const sessions = new Map(); // token -> { username, expires }
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, expires: Date.now() + SESSION_TTL_MS });
  return token;
}
function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expires) { sessions.delete(token); return null; }
  return s;
}
function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}
// ---- login rate limiting (per IP, in-memory) ----
const loginAttempts = new Map(); // ip -> { count, resetAt }
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
}
function loginBlocked(ip) {
  const a = loginAttempts.get(ip);
  if (!a) return false;
  if (Date.now() > a.resetAt) { loginAttempts.delete(ip); return false; }
  return a.count >= MAX_LOGIN_ATTEMPTS;
}
function recordFailedLogin(ip) {
  const a = loginAttempts.get(ip);
  if (!a || Date.now() > a.resetAt) loginAttempts.set(ip, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
  else a.count++;
}
// periodically clear expired sessions / attempts so memory doesn't grow
setInterval(() => {
  const now = Date.now();
  for (const [k, s] of sessions) if (now > s.expires) sessions.delete(k);
  for (const [k, a] of loginAttempts) if (now > a.resetAt) loginAttempts.delete(k);
}, 10 * 60 * 1000).unref();

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a), 'hex');
  const bb = Buffer.from(String(b), 'hex');
  return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
}
function isHttps(req) {
  return req.socket.encrypted || (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}
function sessionCookie(req, value, maxAgeSec) {
  return `mepia_session=${value}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Strict${isHttps(req) ? '; Secure' : ''}`;
}

function requireAuth(req) {
  const cookies = parseCookies(req);
  return getSession(cookies.mepia_session);
}

// ---- helpers ----
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 15 * 1024 * 1024) { reject(new Error('Payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function serveStatic(res, rootDir, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch (e) { res.writeHead(400); res.end('Bad request'); return; }
  let filePath = path.join(rootDir, decoded);
  if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (urlPath.endsWith('/') || urlPath === '') filePath = path.join(filePath, 'index.html');
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA-ish fallback to index.html for admin app routes
      if (rootDir === ADMIN_DIR) {
        const fallback = path.join(ADMIN_DIR, 'index.html');
        fs.readFile(fallback, (e2, data) => {
          if (e2) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(data);
        });
        return;
      }
      res.writeHead(404); res.end('Not found'); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': stat.size };
    // images can be cached long (upload names are unique); css/js/html revalidate
    headers['Cache-Control'] = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.ico'].includes(ext)
      ? 'public, max-age=604800' : 'no-cache';
    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

// ---- data access helpers ----
function allSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  rows.forEach(r => obj[r.key] = r.value);
  return obj;
}
function parseJSONSafe(str, fallback) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}
function destinationOut(row) {
  return { ...row, highlights: parseJSONSafe(row.highlights, []), images: parseJSONSafe(row.images, []) };
}
function packageOut(row) {
  return { ...row, includes: parseJSONSafe(row.includes, []), itinerary: parseJSONSafe(row.itinerary, []) };
}
function getSiteData() {
  const settings = allSettings();
  const destinations = db.prepare('SELECT * FROM destinations ORDER BY sort_order ASC, id ASC').all().map(destinationOut);
  const packages = db.prepare('SELECT * FROM packages ORDER BY sort_order ASC, id ASC').all().map(packageOut);
  const gallery = db.prepare('SELECT * FROM gallery ORDER BY sort_order ASC, id ASC').all();
  return { settings, destinations, packages, gallery };
}

const server = http.createServer(async (req, res) => {
  let p;
  try { p = new URL(req.url, 'http://localhost').pathname; }
  catch (e) { res.writeHead(400); res.end('Bad request'); return; }

  // basic security headers on every response
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=15552000');

  // health check for AWS load balancer / Elastic Beanstalk / ECS
  if (p === '/health' || p === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  // Admin dashboard + admin/auth API are disabled unless ADMIN_ENABLED=true
  if (!ADMIN_ENABLED && (
    p === '/admin' || p.startsWith('/admin/') ||
    p.startsWith('/api/admin/') ||
    p === '/api/login' || p === '/api/logout' || p === '/api/me' || p === '/api/change-password'
  )) {
    res.writeHead(404); res.end('Not found'); return;
  }

  try {
    // ---------- PUBLIC READ API ----------
    if (p === '/api/site' && req.method === 'GET') {
      return sendJSON(res, 200, getSiteData());
    }

    // ---------- SEO: server-rendered homepage, robots.txt, sitemap.xml ----------
    if ((p === '/' || p === '/index.html') && req.method === 'GET') {
      const html = renderIndex(getSiteData());
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    if (p === '/robots.txt' && req.method === 'GET') {
      const siteUrl = (process.env.SITE_URL || allSettings().site_url || '').replace(/\/$/, '');
      const body = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n${siteUrl ? `\nSitemap: ${siteUrl}/sitemap.xml\n` : ''}`;
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(body);
    }
    if (p === '/sitemap.xml' && req.method === 'GET') {
      const siteUrl = (process.env.SITE_URL || allSettings().site_url || '').replace(/\/$/, '');
      const today = new Date().toISOString().slice(0, 10);
      const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>`;
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
      return res.end(body);
    }

    // ---------- AUTH ----------
    if (p === '/api/login' && req.method === 'POST') {
      const ip = clientIp(req);
      if (loginBlocked(ip)) return sendJSON(res, 429, { error: 'Too many login attempts. Try again in 15 minutes.' });
      const body = await readBody(req);
      const { username, password } = body;
      const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(String(username || ''));
      if (!user || !safeEqualHex(hashPassword(String(password || ''), user.salt), user.hash)) {
        recordFailedLogin(ip);
        return sendJSON(res, 401, { error: 'Invalid username or password' });
      }
      loginAttempts.delete(ip);
      const token = createSession(user.username);
      res.setHeader('Set-Cookie', sessionCookie(req, token, SESSION_TTL_MS / 1000));
      return sendJSON(res, 200, { ok: true, username: user.username });
    }
    if (p === '/api/logout' && req.method === 'POST') {
      const cookies = parseCookies(req);
      if (cookies.mepia_session) sessions.delete(cookies.mepia_session);
      res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
      return sendJSON(res, 200, { ok: true });
    }
    if (p === '/api/me' && req.method === 'GET') {
      const session = requireAuth(req);
      if (!session) return sendJSON(res, 401, { error: 'Not logged in' });
      return sendJSON(res, 200, { username: session.username });
    }
    if (p === '/api/change-password' && req.method === 'POST') {
      const session = requireAuth(req);
      if (!session) return sendJSON(res, 401, { error: 'Not logged in' });
      const { currentPassword, newPassword } = await readBody(req);
      const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(session.username);
      if (!user || !safeEqualHex(hashPassword(String(currentPassword || ''), user.salt), user.hash)) {
        return sendJSON(res, 400, { error: 'Current password is incorrect' });
      }
      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        return sendJSON(res, 400, { error: 'New password must be at least 8 characters' });
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPassword(newPassword, salt);
      db.prepare('UPDATE admin_users SET salt = ?, hash = ? WHERE username = ?').run(salt, hash, session.username);
      return sendJSON(res, 200, { ok: true });
    }

    // ---------- everything below requires auth ----------
    if (p.startsWith('/api/admin/')) {
      const session = requireAuth(req);
      if (!session) return sendJSON(res, 401, { error: 'Not logged in' });

      // settings
      if (p === '/api/admin/settings' && req.method === 'PUT') {
        const body = await readBody(req);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJSON(res, 400, { error: 'Invalid settings' });
        const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
        for (const [k, v] of Object.entries(body)) stmt.run(k, String(v));
        return sendJSON(res, 200, { ok: true, settings: allSettings() });
      }

      // destinations
      let m = p.match(/^\/api\/admin\/destinations(?:\/(\d+))?$/);
      if (m) {
        const id = m[1];
        if (req.method === 'POST') {
          const b = await readBody(req);
          const info = db.prepare('INSERT INTO destinations (name, region, tagline, description, image_url, highlights, sort_order, images) VALUES (?,?,?,?,?,?,?,?)')
            .run(b.name || '', b.region || '', b.tagline || '', b.description || '', b.image_url || '', JSON.stringify(b.highlights || []), b.sort_order || 0, JSON.stringify(b.images || []));
          return sendJSON(res, 201, destinationOut(db.prepare('SELECT * FROM destinations WHERE id = ?').get(info.lastInsertRowid)));
        }
        if (req.method === 'PUT' && id) {
          const b = await readBody(req);
          db.prepare('UPDATE destinations SET name=?, region=?, tagline=?, description=?, image_url=?, highlights=?, sort_order=?, images=? WHERE id=?')
            .run(b.name || '', b.region || '', b.tagline || '', b.description || '', b.image_url || '', JSON.stringify(b.highlights || []), b.sort_order || 0, JSON.stringify(b.images || []), id);
          return sendJSON(res, 200, destinationOut(db.prepare('SELECT * FROM destinations WHERE id = ?').get(id)));
        }
        if (req.method === 'DELETE' && id) {
          db.prepare('DELETE FROM destinations WHERE id = ?').run(id);
          return sendJSON(res, 200, { ok: true });
        }
      }

      // packages
      m = p.match(/^\/api\/admin\/packages(?:\/(\d+))?$/);
      if (m) {
        const id = m[1];
        if (req.method === 'POST') {
          const b = await readBody(req);
          const info = db.prepare('INSERT INTO packages (title, duration, route, price, price_note, includes, itinerary, image_url, featured, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .run(b.title || '', b.duration || '', b.route || '', b.price || 0, b.price_note || '', JSON.stringify(b.includes || []), JSON.stringify(b.itinerary || []), b.image_url || '', b.featured ? 1 : 0, b.sort_order || 0);
          return sendJSON(res, 201, packageOut(db.prepare('SELECT * FROM packages WHERE id = ?').get(info.lastInsertRowid)));
        }
        if (req.method === 'PUT' && id) {
          const b = await readBody(req);
          db.prepare('UPDATE packages SET title=?, duration=?, route=?, price=?, price_note=?, includes=?, itinerary=?, image_url=?, featured=?, sort_order=? WHERE id=?')
            .run(b.title || '', b.duration || '', b.route || '', b.price || 0, b.price_note || '', JSON.stringify(b.includes || []), JSON.stringify(b.itinerary || []), b.image_url || '', b.featured ? 1 : 0, b.sort_order || 0, id);
          return sendJSON(res, 200, packageOut(db.prepare('SELECT * FROM packages WHERE id = ?').get(id)));
        }
        if (req.method === 'DELETE' && id) {
          db.prepare('DELETE FROM packages WHERE id = ?').run(id);
          return sendJSON(res, 200, { ok: true });
        }
      }

      // gallery
      m = p.match(/^\/api\/admin\/gallery(?:\/(\d+))?$/);
      if (m) {
        const id = m[1];
        if (req.method === 'POST') {
          const b = await readBody(req);
          const info = db.prepare('INSERT INTO gallery (image_url, caption, location, sort_order) VALUES (?,?,?,?)')
            .run(b.image_url || '', b.caption || '', b.location || '', b.sort_order || 0);
          return sendJSON(res, 201, db.prepare('SELECT * FROM gallery WHERE id = ?').get(info.lastInsertRowid));
        }
        if (req.method === 'DELETE' && id) {
          db.prepare('DELETE FROM gallery WHERE id = ?').run(id);
          return sendJSON(res, 200, { ok: true });
        }
      }

      // image upload (base64 data URL from admin UI)
      if (p === '/api/admin/upload' && req.method === 'POST') {
        const b = await readBody(req);
        const match = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/.exec(b.dataUrl || '');
        if (!match) return sendJSON(res, 400, { error: 'Invalid image data' });
        const ext = match[2] === 'jpeg' ? 'jpg' : match[2];
        const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(match[3], 'base64'));
        return sendJSON(res, 201, { url: `/uploads/${filename}` });
      }

      return sendJSON(res, 404, { error: 'Not found' });
    }

    // ---------- static files ----------
    if (p.startsWith('/uploads/') && UPLOADS_DIR !== BUNDLED_UPLOADS_DIR) {
      // serve from the persistent uploads dir first, fall back to photos bundled in the repo
      const rel = p.replace(/^\/uploads/, '');
      const candidate = path.join(UPLOADS_DIR, rel);
      if (candidate.startsWith(UPLOADS_DIR + path.sep) && fs.existsSync(candidate)) return serveStatic(res, UPLOADS_DIR, rel);
    }
    if (p === '/admin' || p.startsWith('/admin/')) {
      const sub = p.replace(/^\/admin/, '') || '/';
      return serveStatic(res, ADMIN_DIR, sub);
    }
    return serveStatic(res, PUBLIC_DIR, p);
  } catch (err) {
    if (err instanceof SyntaxError) return sendJSON(res, 400, { error: 'Invalid JSON' });
    if (err && err.message === 'Payload too large') return; // connection already destroyed
    console.error(err);
    if (!res.headersSent) sendJSON(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Mepiyu Wander Travels server running on ${HOST}:${PORT}`);
  console.log(ADMIN_ENABLED ? `Admin panel at /admin` : 'Admin panel disabled (set ADMIN_ENABLED=true to enable)');
});

// graceful shutdown (AWS sends SIGTERM on deploy / scale-in)
function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(() => {
    try { db.close(); } catch (e) { /* ignore */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

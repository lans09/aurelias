const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const LOCAL_VISIT_PATH = path.join('/tmp', 'aurelias_visits.json');
const KV_VISITS_KEY = 'aurelias:visits';
const MAX_RECENT_VISITS = 100;

function hasUpstash() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function readVisitStore() {
  if (hasUpstash()) {
    const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['GET', KV_VISITS_KEY]),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.result === 'string') {
        try {
          const parsed = JSON.parse(data.result);
          if (parsed && typeof parsed === 'object') return parsed;
        } catch {
          // Ignore malformed store
        }
      }
    }
    return { totalVisits: 0, uniqueIds: [], recent: [] };
  }

  try {
    if (fs.existsSync(LOCAL_VISIT_PATH)) {
      const raw = fs.readFileSync(LOCAL_VISIT_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // Ignore local read error
  }
  return { totalVisits: 0, uniqueIds: [], recent: [] };
}

async function writeVisitStore(store) {
  if (hasUpstash()) {
    const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', KV_VISITS_KEY, JSON.stringify(store)]),
    });
    if (!res.ok) {
      throw new Error(`Upstash visit write failed (${res.status})`);
    }
    return;
  }

  fs.writeFileSync(LOCAL_VISIT_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function parseDevice(ua = '') {
  if (/iphone|ipad|ipod/i.test(ua)) return 'Mobile (iOS)';
  if (/android/i.test(ua)) return 'Mobile (Android)';
  if (/macintosh|mac os/i.test(ua)) return 'Desktop (macOS)';
  if (/windows/i.test(ua)) return 'Desktop (Windows)';
  if (/linux/i.test(ua)) return 'Desktop (Linux)';
  if (/bot|crawler|spider|headless/i.test(ua)) return 'Bot / Preview';
  return 'Other';
}

function normalizeReferrer(rawRef) {
  if (!rawRef) return 'Direct';
  try {
    const host = new URL(rawRef).hostname.replace(/^www\./, '');
    if (host === 't.co' || host === 'x.com' || host === 'twitter.com') return 'X (Twitter)';
    if (host.includes('evmsync.live')) return 'Internal';
    return host || 'Direct';
  } catch {
    return String(rawRef).slice(0, 48) || 'Direct';
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const adminPass = process.env.ADMIN_KEY || 'admin123';
  const providedKey = req.headers['x-admin-key'];
  const isAdmin = Boolean(providedKey && providedKey === adminPass);

  try {
    if (req.method === 'GET') {
      if (!isAdmin) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
      }
      const store = await readVisitStore();
      return res.end(
        JSON.stringify({
          totalVisits: Number(store.totalVisits || 0),
          uniqueVisitors: Array.isArray(store.uniqueIds) ? store.uniqueIds.length : 0,
          recent: Array.isArray(store.recent) ? store.recent : [],
        })
      );
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const ua = String(req.headers['user-agent'] || '');
      const fwd = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
      const ip = fwd.split(',')[0].trim();
      const visitorHash = crypto
        .createHash('sha256')
        .update(`${ip}|${ua.slice(0, 80)}`)
        .digest('hex')
        .slice(0, 12);

      const country = String(req.headers['x-vercel-ip-country'] || '').trim();
      const rawCity = String(req.headers['x-vercel-ip-city'] || '').trim();
      let city = rawCity;
      try {
        city = rawCity ? decodeURIComponent(rawCity) : '';
      } catch {
        city = rawCity;
      }
      const location = [city, country].filter(Boolean).join(', ') || 'Unknown';

      const store = await readVisitStore();
      const uniqueSet = new Set(Array.isArray(store.uniqueIds) ? store.uniqueIds : []);
      uniqueSet.add(visitorHash);

      const visit = {
        at: Date.now(),
        visitorId: visitorHash,
        path: String(body.path || '/').slice(0, 80),
        source: normalizeReferrer(body.referrer || req.headers.referer || ''),
        device: parseDevice(ua),
        location,
      };

      const recent = [visit, ...(Array.isArray(store.recent) ? store.recent : [])].slice(
        0,
        MAX_RECENT_VISITS
      );

      await writeVisitStore({
        totalVisits: Number(store.totalVisits || 0) + 1,
        uniqueIds: Array.from(uniqueSet).slice(-5000),
        recent,
      });

      res.statusCode = 201;
      return res.end(JSON.stringify({ ok: true }));
    }

    if (req.method === 'DELETE') {
      if (!isAdmin) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
      }
      await writeVisitStore({ totalVisits: 0, uniqueIds: [], recent: [] });
      return res.end(JSON.stringify({ ok: true, cleared: true }));
    }

    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (err) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: err.message || 'Server error' }));
  }
};

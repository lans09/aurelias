const fs = require('fs');
const path = require('path');

const LOCAL_STORE_PATH = path.join('/tmp', 'aurelias_entries.json');
const KV_KEY = 'aurelias:entries';
const BASE_POOL_USDC = 50000;
const BASE_PLAYERS = 7;
const ENTRY_FEE_USD = 2;

function getKvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function readEntries() {
  const kv = getKvConfig();
  if (kv) {
    const res = await fetch(`${kv.url}/get/${encodeURIComponent(KV_KEY)}`, {
      headers: { Authorization: `Bearer ${kv.token}` },
    });
    const data = await res.json();
    if (!data || !data.result) return [];
    return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
  }

  try {
    if (!fs.existsSync(LOCAL_STORE_PATH)) return [];
    return JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

async function writeEntries(entries) {
  const kv = getKvConfig();
  if (kv) {
    await fetch(`${kv.url}/set/${encodeURIComponent(KV_KEY)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kv.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(JSON.stringify(entries)),
    });
    return;
  }

  fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(entries, null, 2), 'utf8');
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    const urlObj = new URL(req.url, 'http://localhost');
    const idParam = urlObj.searchParams.get('id');

    if (req.method === 'GET') {
      const entries = await readEntries();
      if (idParam) {
        const entry = entries.find((e) => e.id === idParam);
        if (!entry) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'Entry not found' }));
        }
        return res.end(JSON.stringify({ entry }));
      }

      const confirmedCount = entries.filter((e) => e.status === 'confirmed').length;
      const isAdmin = req.headers['x-admin-key'] === (process.env.ADMIN_KEY || 'admin123');

      return res.end(
        JSON.stringify({
          totalPlayers: BASE_PLAYERS + confirmedCount,
          totalPoolUsdc: BASE_POOL_USDC + confirmedCount * ENTRY_FEE_USD,
          entries: isAdmin ? entries : undefined,
        })
      );
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const address = String(body.address || '').trim();
      const telegram = String(body.telegram || '').trim();
      const asset = String(body.asset || 'ETH').trim();
      const amountLabel = String(body.amountLabel || '$2').trim();

      if (!address) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'Wallet address is required' }));
      }

      const entries = await readEntries();
      const entry = {
        id: `ENT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        address,
        telegram,
        asset,
        amountLabel,
        status: 'pending',
        createdAt: Date.now(),
        confirmedAt: null,
      };

      entries.unshift(entry);
      await writeEntries(entries);

      res.statusCode = 201;
      return res.end(JSON.stringify({ entry }));
    }

    if (req.method === 'PATCH') {
      const adminKey = req.headers['x-admin-key'];
      const expectedKey = process.env.ADMIN_KEY || 'admin123';
      if (adminKey !== expectedKey) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'Unauthorized admin key' }));
      }

      const body = await readJsonBody(req);
      const id = String(body.id || '').trim();
      const status = body.status === 'confirmed' ? 'confirmed' : 'rejected';

      const entries = await readEntries();
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: 'Entry not found' }));
      }

      entries[idx].status = status;
      entries[idx].confirmedAt = status === 'confirmed' ? Date.now() : null;
      await writeEntries(entries);

      return res.end(JSON.stringify({ entry: entries[idx] }));
    }

    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (err) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: err.message || 'Server error' }));
  }
};

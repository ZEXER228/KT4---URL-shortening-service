import express from 'express';
import { JSONFilePreset } from 'lowdb/node';
import { randomBytes } from 'node:crypto';

const app = express();
const db = await JSONFilePreset('urls.json', { urls: [] });
const port = process.env.PORT || 3000;

function getUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  const original = value.trim();
  const address = /^[a-z][a-z\d+.-]*:\/\//i.test(original) ? original : `https://${original}`;
  const suppliedHost = original
    .replace(/^[a-z][a-z\d+.-]*:\/\//i, '')
    .split(/[/?#]/, 1)[0]
    .replace(/^.*@/, '')
    .split(':', 1)[0];

  try {
    const parsed = new URL(address);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.') || /^\d+$/.test(suppliedHost)) return null;
    return { original, address };
  } catch {
    return null;
  }
}

function shortUrl(req, code) {
  return `${req.protocol}://${req.get('host')}/${code}`;
}

function newCode() {
  let code;
  do {
    code = randomBytes(4).toString('base64url');
  } while (db.data.urls.some((item) => item.code === code));
  return code;
}

async function addUrl(data) {
  const code = newCode();
  db.data.urls.push({ original: data.original, address: data.address, code });
  await db.write();
  return code;
}

app.get('/create', async (req, res) => {
  const data = getUrl(req.query.url);
  const original = typeof req.query.url === 'string' ? req.query.url : '';

  if (!data) return res.json({ original, created: false });

  const found = db.data.urls.find((item) => item.original === data.original);
  if (found) return res.json({ original: data.original, short: shortUrl(req, found.code), created: null });

  try {
    const code = await addUrl(data);
    return res.json({ original: data.original, short: shortUrl(req, code), created: true });
  } catch {
    return res.json({ original: data.original, created: false });
  }
});

app.get('/refresh', async (req, res) => {
  const data = getUrl(req.query.url);
  const original = typeof req.query.url === 'string' ? req.query.url : '';

  if (!data) return res.json({ original, refresh: false });

  const exists = db.data.urls.some((item) => item.original === data.original);
  if (!exists) return res.json({ original: data.original, refresh: null });

  try {
    db.data.urls = db.data.urls.filter((item) => item.original !== data.original);
    const code = await addUrl(data);
    return res.json({ original: data.original, short: shortUrl(req, code), refresh: true });
  } catch {
    return res.json({ original: data.original, refresh: false });
  }
});

app.get('/alias', async (req, res) => {
  const data = getUrl(req.query.url);
  const original = typeof req.query.url === 'string' ? req.query.url : '';

  if (!data) return res.json({ original, alias: false });

  const exists = db.data.urls.some((item) => item.original === data.original);
  if (!exists) {
    try {
      const code = await addUrl(data);
      return res.json({ original: data.original, short: shortUrl(req, code), created: true });
    } catch {
      return res.json({ original: data.original, created: false });
    }
  }

  try {
    const code = await addUrl(data);
    return res.json({ original: data.original, short: shortUrl(req, code), alias: true });
  } catch {
    return res.json({ original: data.original, alias: false });
  }
});

app.get('/remove', async (req, res) => {
  const data = getUrl(req.query.url);
  const original = typeof req.query.url === 'string' ? req.query.url : '';

  if (!data) return res.json({ original, deleted: false });

  const exists = db.data.urls.some((item) => item.original === data.original);
  if (!exists) return res.json({ original: data.original, deleted: null });

  try {
    db.data.urls = db.data.urls.filter((item) => item.original !== data.original);
    await db.write();
    return res.json({ original: data.original, deleted: true });
  } catch {
    return res.json({ original: data.original, deleted: false });
  }
});

app.get('/:code', (req, res) => {
  const found = db.data.urls.find((item) => item.code === req.params.code);
  if (!found) return res.status(404).json({ error: 'Short URL not found' });
  return res.redirect(found.address);
});

app.listen(port, () => console.log(`Server started: http://localhost:${port}`));

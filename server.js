const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'family.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory and file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { members: [], relationships: [], settings: { title: 'Our Family Tree' } };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  if (fs.existsSync(DATA_FILE)) {
    const backupPath = path.join(DATA_DIR, `family.backup.${Date.now()}.json`);
    fs.copyFileSync(DATA_FILE, backupPath);
    const backups = fs.readdirSync(DATA_DIR)
      .filter(f => f.startsWith('family.backup.'))
      .sort()
      .reverse();
    backups.slice(10).forEach(f => fs.unlinkSync(path.join(DATA_DIR, f)));
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/family', (req, res) => {
  res.json(loadData());
});

app.put('/api/settings', (req, res) => {
  const data = loadData();
  data.settings = { ...data.settings, ...req.body };
  saveData(data);
  res.json(data.settings);
});

app.post('/api/members', (req, res) => {
  const data = loadData();
  const member = {
    id: uuidv4(),
    firstName: req.body.firstName || '',
    lastName: req.body.lastName || '',
    maidenName: req.body.maidenName || '',
    gender: req.body.gender || 'unknown',
    birthDate: req.body.birthDate || '',
    deathDate: req.body.deathDate || '',
    photoUrl: req.body.photoUrl || '',
    bio: req.body.bio || '',
    createdAt: new Date().toISOString()
  };
  data.members.push(member);
  saveData(data);
  res.json(member);
});

app.put('/api/members/:id', (req, res) => {
  const data = loadData();
  const idx = data.members.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Member not found' });
  data.members[idx] = { ...data.members[idx], ...req.body, id: req.params.id };
  saveData(data);
  res.json(data.members[idx]);
});

app.delete('/api/members/:id', (req, res) => {
  const data = loadData();
  data.members = data.members.filter(m => m.id !== req.params.id);
  data.relationships = data.relationships.filter(
    r => r.person1 !== req.params.id && r.person2 !== req.params.id
  );
  saveData(data);
  res.json({ ok: true });
});

app.post('/api/relationships', (req, res) => {
  const data = loadData();
  const rel = {
    id: uuidv4(),
    type: req.body.type,
    person1: req.body.person1,
    person2: req.body.person2
  };
  const exists = data.relationships.some(
    r => r.type === rel.type &&
      ((r.person1 === rel.person1 && r.person2 === rel.person2) ||
       (r.type === 'spouse' && r.person1 === rel.person2 && r.person2 === rel.person1))
  );
  if (exists) return res.status(409).json({ error: 'Relationship already exists' });
  data.relationships.push(rel);
  saveData(data);
  res.json(rel);
});

app.delete('/api/relationships/:id', (req, res) => {
  const data = loadData();
  data.relationships = data.relationships.filter(r => r.id !== req.params.id);
  saveData(data);
  res.json({ ok: true });
});

// ─── Image Proxy ───
// Fetches images server-side to handle Immich shared links, pCloud, CORS issues, etc.
app.get('/api/photo', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url parameter required' });

  try {
    const http = url.startsWith('https') ? require('https') : require('http');

    const fetchUrl = (targetUrl, redirectCount = 0) => {
      if (redirectCount > 5) return res.status(502).json({ error: 'Too many redirects' });

      const request = (targetUrl.startsWith('https') ? require('https') : require('http')).get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'image/*,*/*'
        },
        timeout: 10000
      }, (response) => {
        // Follow redirects
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          let redirectUrl = response.headers.location;
          if (redirectUrl.startsWith('/')) {
            const parsed = new URL(targetUrl);
            redirectUrl = parsed.origin + redirectUrl;
          }
          response.resume();
          return fetchUrl(redirectUrl, redirectCount + 1);
        }

        if (response.statusCode !== 200) {
          response.resume();
          return res.status(response.statusCode).json({ error: 'Upstream error' });
        }

        // For Immich shared links — the HTML page contains og:image meta tag
        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('text/html')) {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', chunk => body += chunk);
          response.on('end', () => {
            // Try to extract og:image or immich thumbnail URL
            const ogMatch = body.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
            if (ogMatch && ogMatch[1]) {
              return fetchUrl(ogMatch[1], redirectCount + 1);
            }
            // Try to find asset ID in Immich shared page
            const assetMatch = body.match(/assets\/([a-f0-9-]+)/i);
            if (assetMatch) {
              const parsed = new URL(targetUrl);
              const assetUrl = `${parsed.origin}/api/assets/${assetMatch[1]}/thumbnail?size=preview`;
              return fetchUrl(assetUrl, redirectCount + 1);
            }
            res.status(404).json({ error: 'No image found at URL' });
          });
          return;
        }

        // Pipe the image directly
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        if (response.headers['content-length']) {
          res.setHeader('Content-Length', response.headers['content-length']);
        }
        response.pipe(res);
      });

      request.on('error', (err) => {
        console.error('Photo proxy error:', err.message);
        if (!res.headersSent) res.status(502).json({ error: 'Failed to fetch image' });
      });

      request.on('timeout', () => {
        request.destroy();
        if (!res.headersSent) res.status(504).json({ error: 'Timeout fetching image' });
      });
    };

    fetchUrl(url);
  } catch (err) {
    console.error('Photo proxy error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/export', (req, res) => {
  const data = loadData();
  res.setHeader('Content-Disposition', 'attachment; filename=family-tree-export.json');
  res.json(data);
});

app.post('/api/import', (req, res) => {
  try {
    const data = req.body;
    if (!data.members || !data.relationships) {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    saveData(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Invalid import data' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Family Tree app running on http://0.0.0.0:${PORT}`);
});

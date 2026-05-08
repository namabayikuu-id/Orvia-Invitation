// api/update-status.js
// PATCH /api/update-status
// Body: { slug: string, status: 'baru' | 'proses' | 'selesai' | 'batal' }

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO  = process.env.GITHUB_REPO;
const BRANCH       = process.env.GITHUB_BRANCH || 'main';

function ghHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

const BASE_API = () => `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

async function getFile(filePath) {
  const r = await fetch(`${BASE_API()}/contents/${filePath}?ref=${BRANCH}`, {
    headers: ghHeaders(),
  });
  if (!r.ok) throw new Error(`Gagal baca file "${filePath}": ${r.status} ${await r.text()}`);
  return r.json();
}

async function putFile(filePath, content, sha, message) {
  const r = await fetch(`${BASE_API()}/contents/${filePath}`, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      sha,
      branch: BRANCH,
    }),
  });
  if (!r.ok) throw new Error(`Gagal tulis file "${filePath}": ${r.status} ${await r.text()}`);
  return r.json();
}

// Vercel tidak otomatis parse body untuk PATCH, perlu helper ini
async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body; // sudah di-parse Vercel
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  // Auth
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Env check
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return res.status(500).json({
      error: 'Environment variables belum dikonfigurasi (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)',
    });
  }

  // Parse body
  const body = await parseBody(req);
  const { slug, status } = body;

  const VALID_STATUSES = ['baru', 'proses', 'selesai', 'batal'];

  if (!slug) return res.status(400).json({ error: 'Field "slug" wajib diisi' });
  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Field "status" wajib diisi dan harus salah satu dari: ${VALID_STATUSES.join(', ')}`,
    });
  }

  try {
    // Baca database
    const dbFile = await getFile('data/invitations.json');
    const db = JSON.parse(Buffer.from(dbFile.content, 'base64').toString('utf-8'));

    // Cari record
    const idx = db.findIndex(i => i.slug === slug);
    if (idx < 0) {
      return res.status(404).json({ error: `Undangan dengan slug "${slug}" tidak ditemukan` });
    }

    const oldStatus = db[idx].status;

    // Update
    db[idx].status = status;
    db[idx].updated_at = new Date().toISOString();

    // Simpan ke GitHub
    await putFile(
      'data/invitations.json',
      JSON.stringify(db, null, 2),
      dbFile.sha,
      `data: ${slug} status ${oldStatus} → ${status}`
    );

    return res.status(200).json({
      success: true,
      slug,
      status,
      old_status: oldStatus,
      updated_at: db[idx].updated_at,
    });

  } catch (err) {
    console.error('[update-status]', err);
    return res.status(500).json({ error: err.message });
  }
}

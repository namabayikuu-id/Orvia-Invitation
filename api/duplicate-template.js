// api/duplicate-template.js
// POST /api/duplicate-template
// Body: { sourceId, newId, displayName }
// Copies source template's index.html and creates a fresh design.json for the new template

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO  = process.env.GITHUB_REPO;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

const GH = (path) =>
  `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

const ghGet = { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'Orvia-Invitation', Accept: 'application/vnd.github.v3+json' };
const ghPut = { ...ghGet, 'Content-Type': 'application/json' };

async function getFileSha(path) {
  const r = await fetch(GH(path), { headers: ghGet });
  if (!r.ok) return null;
  return (await r.json()).sha || null;
}

async function commitFile(path, content, message) {
  const sha = await getFileSha(path);
  const r = await fetch(GH(path), {
    method: 'PUT',
    headers: ghPut,
    body: JSON.stringify({
      message,
      content: Buffer.from(content).toString('base64'),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${await r.text()}`);
  return await r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { sourceId, newId, displayName } = req.body || {};

  if (!sourceId || !newId)
    return res.status(400).json({ error: 'sourceId dan newId wajib diisi' });
  if (!/^[a-z0-9-]+$/.test(newId))
    return res.status(400).json({ error: 'newId hanya boleh huruf kecil, angka, dan strip' });

  try {
    // 1. Fetch source template's index.html
    const srcHtmlRes = await fetch(GH(`templates/${sourceId}/index.html`), { headers: ghGet });
    if (!srcHtmlRes.ok)
      return res.status(404).json({ error: `Template sumber "${sourceId}" tidak ditemukan` });

    const srcHtmlData = await srcHtmlRes.json();
    const srcHtmlContent = Buffer.from(srcHtmlData.content, 'base64').toString('utf8');

    // 2. Check if newId already exists
    const existsRes = await fetch(GH(`templates/${newId}/index.html`), { headers: ghGet });
    if (existsRes.ok)
      return res.status(409).json({ error: `Template "${newId}" sudah ada` });

    const now = new Date().toISOString();

    // 3. Commit copied index.html to new template folder
    await commitFile(
      `templates/${newId}/index.html`,
      srcHtmlContent,
      `🎨 Buat template baru: ${newId} (dari ${sourceId})`
    );

    // 4. Create fresh design.json (blank canvas, no layers)
    const designJson = JSON.stringify({
      meta: {
        id: newId,
        displayName: displayName || newId,
        sourceId,
        createdAt: now,
        updatedAt: now,
      },
      layers: [],
      sectionBgs: {},
      customFonts: [],
    }, null, 2);

    await commitFile(
      `templates/${newId}/design.json`,
      designJson,
      `🎨 Init design config: ${newId}`
    );

    return res.status(200).json({
      success: true,
      newId,
      displayName: displayName || newId,
      sourceId,
      url: `/templates/${newId}/index.html`,
    });
  } catch (e) {
    console.error('[duplicate-template]', e);
    return res.status(500).json({ error: e.message });
  }
}

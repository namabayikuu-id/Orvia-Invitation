// api/load-template.js
// GET /api/load-template?templateId=template-elegant
// Membaca templates/{templateId}/design.json dari GitHub

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO  = process.env.GITHUB_REPO;

const GH = (path) =>
  `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

const ghHeaders = {
  Authorization: `token ${GITHUB_TOKEN}`,
  'User-Agent': 'Orvia-Invitation',
  Accept: 'application/vnd.github.v3+json',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { templateId } = req.query;

  if (!templateId) return res.status(400).json({ error: 'templateId wajib diisi' });
  if (!/^[a-z0-9-]+$/.test(templateId))
    return res.status(400).json({ error: 'templateId hanya boleh huruf kecil, angka, dan strip' });

  const filePath = `templates/${templateId}/design.json`;

  try {
    const r = await fetch(GH(filePath), { headers: ghHeaders });

    // Belum pernah disimpan = canvas kosong (normal untuk template baru)
    if (r.status === 404) {
      return res.status(200).json({ ok: true, designConfig: null });
    }

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: `GitHub error (${r.status}): ${err}` });
    }

    const ghData = await r.json();
    const raw    = Buffer.from(ghData.content, 'base64').toString('utf-8');
    const parsed = JSON.parse(raw);

    // Ambil hanya field yang dibutuhkan editor
    const designConfig = {
      layers:      parsed.layers      || [],
      sectionBgs:  parsed.sectionBgs  || {},
      customFonts: parsed.customFonts || [],
    };

    return res.status(200).json({ ok: true, designConfig });

  } catch (e) {
    console.error('[load-template]', e);
    return res.status(500).json({ error: e.message });
  }
}

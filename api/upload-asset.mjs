// api/upload-asset.js  –  Vercel Serverless Function
// Menyimpan asset gambar ke GitHub di path:
//   templates/{templateId}/assets/{filename}
//
// Request body (JSON):
//   templateId    : string  – e.g. "template-elegant"
//   filename      : string  – e.g. "bunga.png"
//   contentBase64 : string  – isi file dalam base64 (tanpa prefix data:...)
//   mimeType      : string  – e.g. "image/png"
//
// Response (JSON):
//   { url: "https://raw.githubusercontent.com/..." }

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO  = process.env.GITHUB_REPO;   // "username/repo-name"
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const ADMIN_SECRET  = process.env.ADMIN_SECRET;

export default async function handler(req, res) {
  // ── Auth ──
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-admin-key'] !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { templateId, filename, contentBase64, mimeType } = req.body;

  if (!templateId) return res.status(400).json({ error: 'templateId wajib diisi' });
  if (!filename)   return res.status(400).json({ error: 'filename wajib diisi' });
  if (!contentBase64) return res.status(400).json({ error: 'contentBase64 wajib diisi' });

  // Sanitasi filename – hanya huruf, angka, titik, dash, underscore
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `templates/${templateId}/assets/${safeName}`;

  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;

  try {
    // Cek apakah file sudah ada (untuk dapat SHA-nya agar bisa update)
    let sha = undefined;
    const checkRes = await fetch(apiUrl + `?ref=${GITHUB_BRANCH}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
    });
    if (checkRes.ok) {
      const existing = await checkRes.json();
      sha = existing.sha; // file sudah ada, ambil SHA untuk update
    }

    // Push ke GitHub
    const body = {
      message: `asset: upload ${safeName} untuk ${templateId}`,
      content: contentBase64,
      branch: GITHUB_BRANCH,
    };
    if (sha) body.sha = sha; // wajib kalau file sudah ada

    const pushRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!pushRes.ok) {
      const err = await pushRes.json();
      return res.status(500).json({ error: err.message || 'Gagal push ke GitHub' });
    }

    // Return URL raw GitHub (langsung bisa dipakai di <img src="">)
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${filePath}`;
    return res.status(200).json({ url: rawUrl, path: filePath });

  } catch (err) {
    console.error('upload-asset error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// api/upload-asset.js
// Vercel Serverless Function – Upload gambar ke GitHub
// Letakkan file ini di: /api/upload-asset.js

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Auth check ────────────────────────────────────────────
  const adminKey = req.headers['x-admin-key'];
  const ADMIN_SECRET = process.env.ADMIN_SECRET;

  if (!ADMIN_SECRET) {
    return res.status(500).json({ error: 'ADMIN_SECRET belum diset di environment variables Vercel' });
  }
  if (adminKey !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized – admin key salah' });
  }

  // ── Validasi body ─────────────────────────────────────────
  const { templateId, filename, contentBase64, mimeType } = req.body || {};

  if (!filename || !contentBase64) {
    return res.status(400).json({ error: 'filename dan contentBase64 wajib diisi' });
  }

  // ── Konfigurasi GitHub ────────────────────────────────────
  const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
  const GITHUB_OWNER  = process.env.GITHUB_OWNER  || 'namabayikuu-id';
  const GITHUB_REPO   = process.env.GITHUB_REPO   || 'Orvia-Invitation';
  const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'GITHUB_TOKEN belum diset di environment variables Vercel' });
  }

  // ── Path tujuan di repo ───────────────────────────────────
  // Contoh: templates/template-elegant/assets/foto-1234567890.jpg
  const safeTemplateId = (templateId || 'template-elegant').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeFilename   = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp      = Date.now();
  const finalFilename  = `${timestamp}-${safeFilename}`;
  const filePath       = `templates/${safeTemplateId}/assets/${finalFilename}`;

  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

  // ── Cek apakah file sudah ada (ambil SHA) ─────────────────
  let sha = null;
  try {
    const checkRes = await fetch(apiUrl, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Orvia-Invitation-Admin',
      },
    });
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      sha = checkData.sha;
    }
  } catch (_) {
    // File belum ada, tidak perlu SHA
  }

  // ── Upload ke GitHub ──────────────────────────────────────
  const body = {
    message: `Upload asset: ${finalFilename}`,
    content: contentBase64,
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;

  const uploadRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'Orvia-Invitation-Admin',
    },
    body: JSON.stringify(body),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    let errMsg = errText;
    try { errMsg = JSON.parse(errText).message || errText; } catch(_) {}
    console.error('[upload-asset] GitHub API error:', uploadRes.status, errMsg);
    return res.status(502).json({ error: `GitHub API error ${uploadRes.status}: ${errMsg}` });
  }

  const uploadData = await uploadRes.json();

  // ── Kembalikan URL publik ─────────────────────────────────
  // Pakai jsDelivr CDN biar gambar langsung bisa diakses (bukan raw.githubusercontent yang sering di-throttle)
  const rawUrl      = uploadData.content?.download_url || '';
  const jsdelivrUrl = `https://cdn.jsdelivr.net/gh/${GITHUB_OWNER}/${GITHUB_REPO}@${GITHUB_BRANCH}/${filePath}`;

  return res.status(200).json({
    url:      jsdelivrUrl,   // URL CDN (lebih cepat & stable)
    rawUrl:   rawUrl,        // URL raw GitHub sebagai backup
    path:     filePath,
    filename: finalFilename,
  });
}

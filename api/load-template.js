// api/load-template.js
// Vercel Serverless Function — baca design config dari GitHub
// Deploy file ini ke: api/load-template.js di repo Anda
//
// Environment variables yang dibutuhkan (sama dengan save-template):
//   GITHUB_TOKEN  — Personal Access Token dengan akses repo
//   GITHUB_REPO   — Format: "namabayikuu-id/Orvia-Invitation"
//   ADMIN_SECRET  — Kunci admin (opsional untuk endpoint publik read-only)

export default async function handler(req, res) {
  // Izinkan GET saja
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { templateId = 'template-elegant' } = req.query;

  // Validasi templateId — hanya huruf, angka, dan tanda hubung
  if (!/^[a-zA-Z0-9_-]+$/.test(templateId)) {
    return res.status(400).json({ error: 'Invalid templateId' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO  = process.env.GITHUB_REPO; // contoh: "namabayikuu-id/Orvia-Invitation"

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({ error: 'Server belum dikonfigurasi (env vars kosong)' });
  }

  // Path file di GitHub — sesuaikan jika save-template.js menyimpan di lokasi berbeda
  const filePath = `data/templates/${templateId}.json`;
  const apiUrl   = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;

  try {
    const ghRes = await fetch(apiUrl, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Orvia-Invitation-App',
      },
    });

    // Template belum pernah disimpan — kembalikan config kosong
    if (ghRes.status === 404) {
      return res.status(200).json({ ok: true, designConfig: null });
    }

    if (!ghRes.ok) {
      const errText = await ghRes.text();
      return res.status(ghRes.status).json({ error: `GitHub error: ${errText}` });
    }

    const ghData = await ghRes.json();

    // Content di-encode base64 oleh GitHub API
    const raw     = Buffer.from(ghData.content, 'base64').toString('utf-8');
    const parsed  = JSON.parse(raw);

    // File bisa menyimpan { designConfig, designLayerHtml } atau langsung designConfig
    const designConfig = parsed.designConfig ?? parsed;

    return res.status(200).json({ ok: true, designConfig });

  } catch (err) {
    console.error('[load-template] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}

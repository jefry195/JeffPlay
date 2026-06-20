import { exec } from 'child_process';
import { existsSync, chmodSync } from 'fs';
import { join } from 'path';
import https from 'https';
import fs from 'fs';
import os from 'os';

const TMP_BIN = join(os.tmpdir(), 'yt-dlp');
const LOCAL_BIN = join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const YT_DLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

function downloadYtDlp() {
  return new Promise((resolve, reject) => {
    if (existsSync(TMP_BIN)) return resolve(TMP_BIN);
    const file = fs.createWriteStream(TMP_BIN);
    https.get(YT_DLP_URL, (res) => {
      const follow = (r) => {
        r.pipe(file);
        file.on('finish', () => { file.close(); try { chmodSync(TMP_BIN, '755'); } catch(e){} resolve(TMP_BIN); });
      };
      if ([301, 302].includes(res.statusCode)) {
        https.get(res.headers.location, follow).on('error', reject);
      } else { follow(res); }
    }).on('error', reject);
  });
}

async function ensureBin() {
  if (process.platform === 'win32' && existsSync(LOCAL_BIN)) return LOCAL_BIN;
  if (existsSync(TMP_BIN)) return TMP_BIN;
  return await downloadYtDlp();
}

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

  try {
    const binPath = await ensureBin();
    exec(`"${binPath}" --no-warnings -j "https://www.youtube.com/watch?v=${id}"`,
      { maxBuffer: 5 * 1024 * 1024, timeout: 25000 },
      (err, stdout) => {
        if (err) { res.status(500).json({ error: err.message }); return; }
        try {
          const d = JSON.parse(stdout);
          res.status(200).json({
            title: d.title,
            artist: d.uploader || d.channel || 'Artis YouTube',
            duration: d.duration || 0,
            coverUrl: d.thumbnail || `https://img.youtube.com/vi/${id}/hqdefault.jpg`
          });
        } catch { res.status(500).json({ error: 'Parse error' }); }
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

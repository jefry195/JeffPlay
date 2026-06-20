import { exec } from 'child_process';
import { existsSync, chmodSync, writeFileSync } from 'fs';
import { join } from 'path';
import https from 'https';
import fs from 'fs';
import os from 'os';

const TMP_BIN = join(os.tmpdir(), 'yt-dlp');
const LOCAL_BIN_WIN = join(process.cwd(), 'bin', 'yt-dlp.exe');
const LOCAL_BIN_LIN = join(process.cwd(), 'bin', 'yt-dlp');
const YT_DLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

function downloadYtDlp() {
  return new Promise((resolve, reject) => {
    if (existsSync(TMP_BIN)) return resolve(TMP_BIN);
    const tmp = TMP_BIN + '.part';
    const file = fs.createWriteStream(tmp);

    function follow(url, depth = 0) {
      if (depth > 5) return reject(new Error('Too many redirects'));
      https.get(url, { timeout: 20000 }, (res) => {
        if ([301, 302, 307].includes(res.statusCode) && res.headers.location) {
          res.resume();
          return follow(res.headers.location, depth + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            try {
              fs.renameSync(tmp, TMP_BIN);
              chmodSync(TMP_BIN, '755');
            } catch (e) { /* ignore */ }
            resolve(TMP_BIN);
          });
        });
        res.on('error', reject);
      }).on('error', reject).on('timeout', () => reject(new Error('Download timeout')));
    }
    follow(YT_DLP_URL);
  });
}

async function ensureBin() {
  if (process.platform === 'win32') {
    if (existsSync(LOCAL_BIN_WIN)) return LOCAL_BIN_WIN;
  } else {
    if (existsSync(LOCAL_BIN_LIN)) return LOCAL_BIN_LIN;
  }
  if (existsSync(TMP_BIN)) return TMP_BIN;
  // Download with 25s timeout
  return await Promise.race([
    downloadYtDlp(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Download timed out')), 25000))
  ]);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { q, page = '1' } = req.query;
  if (!q) { res.status(400).json({ error: 'Missing q' }); return; }

  const pageNum = parseInt(page, 10) || 1;
  const pageSize = 20;
  const start = (pageNum - 1) * pageSize + 1;
  const end = pageNum * pageSize;

  let binPath;
  try {
    binPath = await ensureBin();
  } catch (e) {
    console.warn('[yt-search] yt-dlp not available:', e.message);
    // Return empty array so client falls back to Invidious
    res.status(200).json([]);
    return;
  }

  const searchTarget = `ytsearch100:${q}`;
  const cmd = `"${binPath}" --no-warnings -j --flat-playlist --playlist-start ${start} --playlist-end ${end} "${searchTarget}"`;

  exec(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 28000 }, (err, stdout) => {
    if (err) {
      console.warn('[yt-search] exec error:', err.message);
      res.status(200).json([]); // graceful fallback
      return;
    }
    const videos = stdout.split('\n')
      .filter(l => l.trim())
      .map(line => {
        try {
          const d = JSON.parse(line);
          return {
            videoId: d.id,
            title: d.title,
            author: d.uploader || d.channel || 'Artis YouTube',
            lengthSeconds: Math.round(d.duration || 0)
          };
        } catch { return null; }
      })
      .filter(Boolean);

    res.status(200).json(videos);
  });
}

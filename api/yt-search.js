import { exec } from 'child_process';
import { existsSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import https from 'https';
import fs from 'fs';
import os from 'os';

// yt-dlp binary path — use /tmp on serverless (writable), local bin/ on dev
const TMP_BIN = join(os.tmpdir(), 'yt-dlp');
const LOCAL_BIN = join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const YT_DLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

function getBinPath() {
  if (existsSync(LOCAL_BIN)) return LOCAL_BIN;
  return TMP_BIN;
}

function downloadYtDlp() {
  return new Promise((resolve, reject) => {
    if (existsSync(TMP_BIN)) return resolve(TMP_BIN);
    const file = fs.createWriteStream(TMP_BIN);
    https.get(YT_DLP_URL, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        https.get(res.headers.location, (res2) => {
          res2.pipe(file);
          file.on('finish', () => {
            file.close();
            try { chmodSync(TMP_BIN, '755'); } catch(e) {}
            resolve(TMP_BIN);
          });
        }).on('error', reject);
      } else {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          try { chmodSync(TMP_BIN, '755'); } catch(e) {}
          resolve(TMP_BIN);
        });
      }
    }).on('error', reject);
  });
}

async function ensureBin() {
  if (process.platform === 'win32' && existsSync(LOCAL_BIN)) return LOCAL_BIN;
  if (existsSync(TMP_BIN)) return TMP_BIN;
  return await downloadYtDlp();
}

export default async function handler(req, res) {
  const { q, page = '1' } = req.query;
  if (!q) {
    res.status(400).json({ error: 'Missing q parameter' });
    return;
  }

  const pageNum = parseInt(page, 10) || 1;
  const pageSize = 20;
  const start = (pageNum - 1) * pageSize + 1;
  const end = pageNum * pageSize;

  try {
    const binPath = await ensureBin();
    const searchTarget = `ytsearch100:${q}`;
    const args = [
      '--no-warnings', '-j', '--flat-playlist',
      '--playlist-start', String(start),
      '--playlist-end', String(end),
      searchTarget
    ].map(a => `"${a}"`).join(' ');

    exec(`"${binPath}" ${args}`, { maxBuffer: 10 * 1024 * 1024, timeout: 25000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[yt-search] Error:', err.message);
        res.status(500).json({ error: err.message });
        return;
      }

      const lines = stdout.split('\n').filter(l => l.trim());
      const videos = lines.map(line => {
        try {
          const d = JSON.parse(line);
          return {
            videoId: d.id,
            title: d.title,
            author: d.uploader || d.channel || 'Artis YouTube',
            lengthSeconds: Math.round(d.duration || 0)
          };
        } catch { return null; }
      }).filter(Boolean);

      res.status(200).json(videos);
    });
  } catch (err) {
    console.error('[yt-search] Fatal:', err);
    res.status(500).json({ error: err.message });
  }
}

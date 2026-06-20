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
    const tmp = TMP_BIN + '.part';
    const file = fs.createWriteStream(tmp);
    function follow(url, depth = 0) {
      if (depth > 5) return reject(new Error('Too many redirects'));
      https.get(url, { timeout: 20000 }, (res) => {
        if ([301, 302, 307].includes(res.statusCode) && res.headers.location) {
          res.resume(); return follow(res.headers.location, depth + 1);
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            try { fs.renameSync(tmp, TMP_BIN); chmodSync(TMP_BIN, '755'); } catch (e) {}
            resolve(TMP_BIN);
          });
        });
        res.on('error', reject);
      }).on('error', reject);
    }
    follow(YT_DLP_URL);
  });
}

async function ensureBin() {
  if (existsSync(LOCAL_BIN)) return LOCAL_BIN;
  if (existsSync(TMP_BIN)) return TMP_BIN;
  return await Promise.race([
    downloadYtDlp(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 25000))
  ]);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { id } = req.query;
  if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

  let binPath;
  try { binPath = await ensureBin(); }
  catch (e) { res.status(503).json({ error: 'yt-dlp unavailable' }); return; }

  const playlistUrl = `https://www.youtube.com/playlist?list=${id}`;
  const cmd = `"${binPath}" --no-warnings -j --flat-playlist "${playlistUrl}"`;

  exec(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 55000 }, (err, stdout) => {
    if (err) { res.status(500).json({ error: err.message }); return; }
    const tracks = stdout.split('\n').filter(l => l.trim()).map(line => {
      try {
        const d = JSON.parse(line);
        return {
          videoId: d.id,
          title: d.title || 'Video',
          author: d.uploader || d.channel || 'YouTube',
          lengthSeconds: Math.round(d.duration || 0)
        };
      } catch { return null; }
    }).filter(Boolean);
    res.status(200).json(tracks);
  });
}

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
  const { q } = req.query;
  if (!q) { res.status(400).json({ error: 'Missing q' }); return; }

  let binPath;
  try { binPath = await ensureBin(); }
  catch (e) { res.status(200).json([]); return; }

  // YouTube search filtered to playlists only (sp=EgIQAw%3D%3D)
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAw%3D%3D`;
  const cmd = `"${binPath}" --no-warnings -j --flat-playlist --playlist-end 15 "${searchUrl}"`;

  exec(cmd, { maxBuffer: 5 * 1024 * 1024, timeout: 28000 }, (err, stdout) => {
    if (err) { res.status(200).json([]); return; }
    const playlists = stdout.split('\n').filter(l => l.trim()).map(line => {
      try {
        const d = JSON.parse(line);
        const thumb = (d.thumbnails && d.thumbnails.length > 0)
          ? d.thumbnails[d.thumbnails.length - 1].url
          : `https://img.youtube.com/vi/${d.id}/hqdefault.jpg`;
        return {
          playlistId: d.id,
          title: d.title || 'Playlist',
          channel: d.uploader || d.channel || 'YouTube',
          videoCount: d.playlist_count || d.n_entries || null,
          thumbnailUrl: thumb
        };
      } catch { return null; }
    }).filter(Boolean);
    res.status(200).json(playlists);
  });
}

import { defineConfig } from 'vite';
import http from 'http';
import https from 'https';

export default defineConfig({
  plugins: [
    {
      name: 'proxy-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const urlObj = new URL(req.url, 'http://localhost');
          if (urlObj.pathname === '/api/yt-playlist-search') {
            const query = urlObj.searchParams.get('q');
            if (!query) { res.statusCode = 400; res.end('Missing q'); return; }

            import('child_process').then(({ execFile }) => {
              import('path').then(({ default: path }) => {
                const binPath = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
                // YouTube search with playlist filter: sp=EgIQAw%3D%3D
                const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAw%3D%3D`;
                execFile(binPath, [
                  '--no-warnings', '-j', '--flat-playlist',
                  '--playlist-end', '15',
                  searchUrl
                ], { maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
                  if (err) {
                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify([]));
                    return;
                  }
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
                  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                  res.end(JSON.stringify(playlists));
                });
              });
            });
            return;
          }

          if (urlObj.pathname === '/api/yt-playlist') {
            const playlistId = urlObj.searchParams.get('id');
            if (!playlistId) { res.statusCode = 400; res.end('Missing id'); return; }

            import('child_process').then(({ execFile }) => {
              import('path').then(({ default: path }) => {
                const binPath = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
                const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
                execFile(binPath, [
                  '--no-warnings', '-j', '--flat-playlist', playlistUrl
                ], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
                  if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({ error: err.message }));
                    return;
                  }
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
                  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                  res.end(JSON.stringify(tracks));
                });
              });
            });
            return;
          }

          if (urlObj.pathname === '/api/yt-search') {
            const query = urlObj.searchParams.get('q');
            const pageStr = urlObj.searchParams.get('page') || '1';
            const page = parseInt(pageStr, 10) || 1;

            if (!query) {
              res.statusCode = 400;
              res.end('Missing q parameter');
              return;
            }

            import('child_process').then(({ execFile }) => {
              import('path').then(({ default: path }) => {
                const binPath = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
                console.error(`[yt-search] Searching for: "${query}" (Page: ${page})`);

                const pageSize = 20;
                const start = (page - 1) * pageSize + 1;
                const end = page * pageSize;
                const searchTarget = `ytsearch100:${query}`;

                execFile(binPath, [
                  '--no-warnings',
                  '-j',
                  '--flat-playlist',
                  '--playlist-start', String(start),
                  '--playlist-end', String(end),
                  searchTarget
                ], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
                  if (err) {
                    console.error('[yt-search] Error:', err, stderr);
                    res.statusCode = 500;
                    res.writeHead(500, {
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({ error: err.message }));
                    return;
                  }

                  try {
                    const lines = stdout.split('\n').filter(line => line.trim() !== '');
                    const videos = lines.map(line => {
                      try {
                        const data = JSON.parse(line);
                        return {
                          videoId: data.id,
                          title: data.title,
                          author: data.uploader || data.channel || 'Artis YouTube',
                          lengthSeconds: Math.round(data.duration || 0)
                        };
                      } catch (e) {
                        return null;
                      }
                    }).filter(v => v !== null);

                    res.writeHead(200, {
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify(videos));
                  } catch (parseErr) {
                    res.writeHead(500, {
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({ error: 'Failed to parse search results' }));
                  }
                });
              });
            });
            return;
          }

          if (urlObj.pathname === '/api/yt-info') {
            const videoId = urlObj.searchParams.get('id');
            if (!videoId) {
              res.statusCode = 400;
              res.end('Missing id parameter');
              return;
            }

            import('child_process').then(({ execFile }) => {
              import('path').then(({ default: path }) => {
                const binPath = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
                console.error(`[yt-info] Resolving metadata for video: ${videoId}`);
                
                execFile(binPath, ['--no-warnings', '-j', `https://www.youtube.com/watch?v=${videoId}`], (err, stdout, stderr) => {
                  if (err) {
                    console.error('[yt-info] Error:', err, stderr);
                    res.statusCode = 500;
                    res.writeHead(500, { 
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({ error: err.message }));
                    return;
                  }

                  try {
                    const data = JSON.parse(stdout);
                    const result = {
                      title: data.title,
                      artist: data.uploader || data.channel || 'Artis YouTube',
                      duration: data.duration || 0,
                      coverUrl: data.thumbnail || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
                    };
                    res.writeHead(200, {
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify(result));
                  } catch (parseErr) {
                    res.writeHead(500, {
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({ error: 'Failed to parse yt-dlp metadata' }));
                  }
                });
              });
            });
            return;
          }

          if (urlObj.pathname === '/api/yt-download') {
            const videoId = urlObj.searchParams.get('id');
            if (!videoId) {
              res.statusCode = 400;
              res.end('Missing id parameter');
              return;
            }

            import('child_process').then(({ execFile }) => {
              import('path').then(({ default: path }) => {
                const binPath = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
                console.error(`[yt-download] Resolving stream URL for video: ${videoId}`);
                
                execFile(binPath, ['--no-warnings', '-g', '-f', 'ba', `https://www.youtube.com/watch?v=${videoId}`], (err, stdout, stderr) => {
                  if (err) {
                    console.error('[yt-download] Error:', err, stderr);
                    res.statusCode = 500;
                    res.writeHead(500, { 
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({ error: err.message }));
                    return;
                  }

                  const streamUrl = stdout.trim();
                  res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                  });
                  res.end(JSON.stringify({ url: streamUrl }));
                });
              });
            });
            return;
          }

          if (urlObj.pathname === '/proxy-api') {
            console.error(`[Proxy] Incoming request: ${req.url}`);
            if (req.method === 'OPTIONS') {
              res.writeHead(200, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Methods': '*'
              });
              res.end();
              return;
            }

            const targetUrl = urlObj.searchParams.get('url');
            if (!targetUrl) {
              res.statusCode = 400;
              res.end('Missing url parameter');
              return;
            }

            const reqHeaders = {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': req.headers.accept || '*/*'
            };

            if (req.headers.range) {
              reqHeaders['Range'] = req.headers.range;
            }

            function performProxyRequest(currentUrl, redirectCount = 0) {
              if (redirectCount > 10) {
                console.error(`[Proxy] Too many redirects for ${targetUrl}`);
                res.statusCode = 500;
                res.end('Too many redirects');
                return;
              }

              try {
                const currentUrlObj = new URL(currentUrl);
                const client = currentUrl.startsWith('https') ? https : http;
                
                const headers = { ...reqHeaders };
                headers['host'] = currentUrlObj.host;

                console.error(`[Proxy] Fetching: ${currentUrl} (Redirect: ${redirectCount})`);

                const proxyReq = client.get(currentUrl, { headers, timeout: 6000 }, (proxyRes) => {
                  // Handle redirects
                  if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
                    let redirectUrl = proxyRes.headers.location;
                    if (!redirectUrl.startsWith('http')) {
                      redirectUrl = new URL(redirectUrl, currentUrl).toString();
                    }
                    console.error(`[Proxy] Redirecting to: ${redirectUrl}`);
                    performProxyRequest(redirectUrl, redirectCount + 1);
                    return;
                  }

                  const responseHeaders = {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': '*',
                    'Access-Control-Allow-Methods': '*'
                  };

                  if (proxyRes.headers['content-type']) {
                    responseHeaders['Content-Type'] = proxyRes.headers['content-type'];
                  }
                  if (proxyRes.headers['content-length']) {
                    responseHeaders['Content-Length'] = proxyRes.headers['content-length'];
                  }
                  if (proxyRes.headers['content-range']) {
                    responseHeaders['Content-Range'] = proxyRes.headers['content-range'];
                  }
                  if (proxyRes.headers['accept-ranges']) {
                    responseHeaders['Accept-Ranges'] = proxyRes.headers['accept-ranges'];
                  }

                  res.writeHead(proxyRes.statusCode, responseHeaders);
                  proxyRes.pipe(res);
                });

                proxyReq.on('timeout', () => {
                  console.error(`[Proxy] Timeout fetching: ${currentUrl}`);
                  proxyReq.destroy();
                  if (!res.headersSent) {
                    res.statusCode = 504;
                    res.end('Gateway Timeout');
                  }
                });

                proxyReq.on('error', (err) => {
                  console.error('[Proxy] Request error:', err);
                  if (!res.headersSent) {
                    res.statusCode = 500;
                    res.end(`Proxy error: ${err.message}`);
                  }
                });

                req.on('close', () => {
                  proxyReq.destroy();
                });
              } catch (err) {
                console.error('[Proxy] URL Parse error:', err);
                if (!res.headersSent) {
                  res.statusCode = 400;
                  res.end(`Invalid URL: ${err.message}`);
                }
              }
            }

            performProxyRequest(targetUrl);
            return;
          }
          next();
        });
      }
    }
  ],
  server: {
    proxy: {
      '/youtube-playlist': {
        target: 'https://www.youtube.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/youtube-playlist/, '/playlist'),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      },
      '/youtube-search': {
        target: 'https://www.youtube.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/youtube-search/, '/results'),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      }
    }
  }
});

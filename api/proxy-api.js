import http from 'http';
import https from 'https';

export default function handler(req, res) {
  const { url: targetUrl } = req.query;
  if (!targetUrl) { res.status(400).end('Missing url parameter'); return; }

  const reqHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept': req.headers['accept'] || '*/*'
  };
  if (req.headers['range']) reqHeaders['Range'] = req.headers['range'];

  function doRequest(currentUrl, hops = 0) {
    if (hops > 10) { res.status(500).end('Too many redirects'); return; }
    try {
      const urlObj = new URL(currentUrl);
      const client = currentUrl.startsWith('https') ? https : http;
      const proxyReq = client.get(currentUrl, { headers: { ...reqHeaders, host: urlObj.host }, timeout: 8000 }, (proxyRes) => {
        if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
          let loc = proxyRes.headers.location;
          if (!loc.startsWith('http')) loc = new URL(loc, currentUrl).toString();
          doRequest(loc, hops + 1);
          return;
        }
        const outHeaders = { 'Access-Control-Allow-Origin': '*' };
        if (proxyRes.headers['content-type'])   outHeaders['Content-Type']   = proxyRes.headers['content-type'];
        if (proxyRes.headers['content-length'])  outHeaders['Content-Length'] = proxyRes.headers['content-length'];
        if (proxyRes.headers['content-range'])   outHeaders['Content-Range']  = proxyRes.headers['content-range'];
        if (proxyRes.headers['accept-ranges'])   outHeaders['Accept-Ranges']  = proxyRes.headers['accept-ranges'];
        res.writeHead(proxyRes.statusCode, outHeaders);
        proxyRes.pipe(res);
      });
      proxyReq.on('timeout', () => { proxyReq.destroy(); if (!res.headersSent) res.status(504).end('Timeout'); });
      proxyReq.on('error', (e) => { if (!res.headersSent) res.status(500).end(e.message); });
    } catch (e) {
      if (!res.headersSent) res.status(400).end(e.message);
    }
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });
    res.end();
    return;
  }

  doRequest(targetUrl);
}

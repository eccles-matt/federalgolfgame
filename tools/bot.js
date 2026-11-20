const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = '/home/user/federalgolfgame';
const types = { '.svg': 'image/svg+xml', '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png' };
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); }).listen(8143);
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8143/'); await p.waitForTimeout(800);
  await p.screenshot({ path: 'home.png' });
  const only = process.argv[2] ? [parseInt(process.argv[2])] : Array.from({ length: 18 }, (_, i) => i + 1);
  for (const n of only) {
    await p.evaluate((n) => window.__fm.startHole(n), n);
    await p.waitForFunction(() => window.__fm.state === 'ready');
    await p.waitForTimeout(250);
    if (process.argv[3]) await p.screenshot({ path: `hole${n}.png` });
    const res = await p.evaluate(() => {
      const f = window.__fm, H = f.H, R = 7.5;
      const checks = { teeSdf: Math.round(f.sdf(H.tee[0], H.tee[1])), cupSdf: Math.round(f.sdf(H.cup[0], H.cup[1])), teeHaz: f.hazardAt(H.tee[0], H.tee[1]), teeSand: f.inSand(H.tee[0], H.tee[1]), cupSand: f.inSand(H.cup[0], H.cup[1]) };
      // geodesic distance field from the cup
      const C = 3, GW = 120, GH = 254, INF = 1e9, dist = new Float64Array(GW * GH).fill(INF), cost = new Float64Array(GW * GH);
      for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const x = i * C + 1.5, y = j * C + 1.5; cost[j * GW + i] = f.sdf(x, y) < -R ? (f.hazardAt(x, y) ? 30 : f.inSand(x, y) ? 3 : 1) : INF; }
      const ci = Math.round(H.cup[0] / C), cj = Math.round(H.cup[1] / C), q = [[0, cj * GW + ci]]; dist[cj * GW + ci] = 0;
      while (q.length) { // simple dijkstra with a sorted queue (small grid)
        let bi = 0; for (let k = 1; k < q.length; k++) if (q[k][0] < q[bi][0]) bi = k;
        const [d0, id] = q[bi]; q[bi] = q[q.length - 1]; q.pop(); if (d0 > dist[id]) continue;
        const i = id % GW, j = (id - i) / GW;
        for (const [di, dj, w] of [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.41],[1,-1,1.41],[-1,1,1.41],[-1,-1,1.41]]) {
          const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue; const nid = nj * GW + ni; if (cost[nid] >= INF) continue;
          const nd = d0 + w * cost[nid]; if (nd < dist[nid]) { dist[nid] = nd; q.push([nd, nid]); } }
      }
      const g = (x, y) => dist[Math.round(y / C - .5) * GW + Math.round(x / C - .5)];
      const clear = (x0, y0, x1, y1) => { const L = Math.hypot(x1 - x0, y1 - y0); for (let t = 0; t <= L; t += 3) { const x = x0 + (x1 - x0) * t / L, y = y0 + (y1 - y0) * t / L; if (f.sdf(x, y) > -R - 0.5 || f.hazardAt(x, y)) return false; } return true; };
      const need = (D) => { let lo = 0, hi = 2000; for (let k = 0; k < 40; k++) { const v = (lo + hi) / 2, d = v / 1.1 - 55 / 1.21 * Math.log(1 + 1.1 * v / 55); if (d < D) lo = v; else hi = v; } return lo; };
      const log = []; let n = 0, splashes = 0;
      while (n < 25 && f.state === 'ready') {
        const bx = f.ball.x, by = f.ball.y; let best = null, bs = g(bx, by);
        if (clear(bx, by, H.cup[0], H.cup[1])) best = [H.cup[0], H.cup[1], true];
        else for (let k = 0; k < 900; k++) { const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 300, x = bx + Math.cos(a) * r, y = by + Math.sin(a) * r; if (x < 2 || y < 2 || x > 358 || y > 758) continue; const gd = g(x, y); if (gd < bs - 5 && clear(bx, by, x, y)) { bs = gd; best = [x, y, false]; } }
        if (!best) { // no straight line: jump holes need a full blast up the screen
          const r = f.simShot(-Math.PI / 2, 1); n++; log.push('blast:' + r); if (r === 'splash') splashes++; continue; }
        const D = Math.hypot(best[0] - bx, best[1] - by) + (best[2] ? 4 : -10);
        const pw = Math.min(1, need(Math.max(5, D)) / f.feel.power * (f.inSand(bx, by) ? 1 / 0.6 : 1) * (1 + (Math.random() - .5) * .1));
        const r = f.simShot(Math.atan2(best[1] - by, best[0] - bx), pw); n++; if (r === 'splash') splashes++;
        log.push(Math.round(f.ball.x) + ',' + Math.round(f.ball.y) + ':' + r);
        if (r === 'sinking') break;
      }
      return { checks, shots: f.shots, state: f.state, splashes, reachable: g(H.tee[0], H.tee[1]) < 1e8, log: log.slice(0, 8) };
    });
    console.log(n, JSON.stringify(res));
  }
  console.log('errors', errs);
  await b.close(); srv.close();
})();

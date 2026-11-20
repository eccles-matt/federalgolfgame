const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file:///mnt/project-files/designs/federal-minigolf-looks.html');
  const out = await p.evaluate(() => {
    const res = [];
    for (let n = 1; n <= 18; n++) {
      const svg = [...document.querySelectorAll('.phone svg')].find(s => (s.getAttribute('aria-label') || '').startsWith(`Hole ${n},`));
      res.push({ n, svg: svg.outerHTML });
    }
    return res;
  });
  require('fs').writeFileSync('raw.json', JSON.stringify(out));
  // defs lookup: all elements with id in the page
  const defs = await p.evaluate(() => { const m = {}; document.querySelectorAll('[id]').forEach(e => { if (e.closest('svg') && !e.matches('svg')) m[e.id] = e.outerHTML; }); return m; });
  require('fs').writeFileSync('defs.json', JSON.stringify(defs));
  await b.close();
})();

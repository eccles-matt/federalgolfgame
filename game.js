/* Federal Minigolf. World units match the designs: a 360 x 760 portrait screen, green near the top. */
(() => {
  'use strict';
  const VERSION = 'v0.4 · roo kick arrows';
  const HOLES = window.HOLES;
  const $ = (id) => document.getElementById(id);

  // ---------- storage ----------
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };

  // ---------- feel settings (tunable from the pause menu) ----------
  const DEFAULTS = { power: 620, grass: 1.1, sand: 4, bounce: 0.72, sound: 1 };
  let feel = { ...DEFAULTS, ...load('fm.feel', {}) };

  const BALL_R = 7.5;
  const SAND_OUT = 0.6, SAND_SPRAY = Math.atan(0.10); // sand shots: 60% power, up to 10% sideways
  const MAX_DRAG = 120;
  const BUNKER_D = 'M-50 -6 C-52 -30 -14 -36 6 -26 C22 -18 34 -34 50 -22 C64 -10 56 22 30 28 C8 34 -10 26 -26 28 C-44 30 -48 14 -50 -6Z';
  const POND_D = 'M-66 -4 C-70 -36 -30 -50 4 -44 C40 -40 70 -30 68 0 C66 32 34 48 0 46 C-34 44 -62 28 -66 -4Z';
  const hitCtx = document.createElement('canvas').getContext('2d');
  const bunkerPath = new Path2D(BUNKER_D), pondPath = new Path2D(POND_D);

  // ---------- current hole ----------
  let H = null; // prepared hole
  function prepare(d) {
    const caps = [];
    for (const p of d.polys) for (let i = 0; i < p.pts.length - 1; i++) caps.push([...p.pts[i], ...p.pts[i + 1], p.hw]);
    for (const c of d.caps) caps.push(c);
    const h = { ...d, capsList: caps, cupDrop: d.cupDrop || 130 };
    h.cupLip = h.cupDrop * 1.6;
    h.rough = d.rough.map((r) => (r.scrub ? { ...r, line: d.polys[0].pts.filter((p) => p[1] >= r.scrub[0] - 10 && p[1] <= r.scrub[1] + 10) } : r));
    h.rooState = d.roos.map((r) => {
      if (r.kind === 'hop') {
        const gy = r.y + 44;
        const spots = [r.x - 30, r.x, r.x + 30].filter((x) => sdf(x, gy, caps, d.circles) < -16);
        return { ...r, gy, spots: spots.length ? spots : [r.x], h: 0, from: r.x, to: r.x, t: 0, rest: 1, hopping: false, facing: -1, squash: 0 };
      }
      if (r.kind === 'kick' || r.kind === 'mob') {
        const zone = r.kind === 'kick' ? { x: r.x - 10, y: r.y + 28, rx: 36, ry: 26 } : { x: r.x, y: r.y + 30, rx: 40, ry: 26 };
        return { ...r, zone, awake: true, timer: 1 + Math.random() * 1.5, cool: 0, squash: 0 };
      }
      return { ...r };
    });
    h.bodies = [];
    for (const r of d.roos) {
      if (r.kind === 'sleepy') h.bodies.push([r.x + 4, r.y + 4, 16], [r.x + 27, r.y + 2, 6]); // body and head; the tail can be rolled over
      if (r.kind === 'kick') h.bodies.push([r.x + 7, r.y + 18, 13]);
      if (r.kind === 'mob') h.bodies.push([r.x + 18, r.y + 17, 12], [r.x - 32, r.y + 25, 10]);
    }
    h.strays = (d.range || []).map((a, i) => ({ a, t: -1 - i * 1.3, dur: 1.15 }));
    return h;
  }

  // ---------- geometry ----------
  function segDist(px, py, s) {
    const dx = s[2] - s[0], dy = s[3] - s[1], L2 = dx * dx + dy * dy || 1;
    let t = ((px - s[0]) * dx + (py - s[1]) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (s[0] + dx * t), py - (s[1] + dy * t));
  }
  function sdf(x, y, caps = H.capsList, circles = H.circles) {
    let d = Infinity;
    for (const s of caps) { const v = segDist(x, y, s) - s[4]; if (v < d) d = v; }
    for (const c of circles) { const v = Math.hypot(x - c[0], y - c[1]) - c[2]; if (v < d) d = v; }
    return d;
  }
  function sdfNormal(x, y) {
    const e = 0.5, nx = sdf(x + e, y) - sdf(x - e, y), ny = sdf(x, y + e) - sdf(x, y - e), L = Math.hypot(nx, ny) || 1;
    return [nx / L, ny / L];
  }
  function local(x, y, cx, cy, rot, sx, sy) {
    const a = -rot * Math.PI / 180, dx = x - cx, dy = y - cy;
    return [(dx * Math.cos(a) - dy * Math.sin(a)) / sx, (dx * Math.sin(a) + dy * Math.cos(a)) / sy];
  }
  function inSand(x, y) {
    for (const [bx, by, rot, s, clip] of H.sand) {
      if (clip && Math.hypot(x - clip[0], y - clip[1]) > clip[2]) continue;
      if (Math.abs(x - bx) > 80 * s || Math.abs(y - by) > 80 * s) continue;
      const [lx, ly] = local(x, y, bx, by, rot, s, s);
      if (hitCtx.isPointInPath(bunkerPath, lx, ly)) return true;
    }
    return false;
  }
  const inRect = (x, y, r) => x > r[0] && x < r[2] && y > r[1] && y < r[3];
  function hazardAt(x, y) {
    for (const w of H.water) {
      if (w.clip && !inRect(x, y, w.clip)) continue;
      if (w.exclude && inRect(x, y, w.exclude)) continue;
      const [lx, ly] = local(x, y, w.x, w.y, 0, w.sx, w.sy);
      if (hitCtx.isPointInPath(pondPath, lx, ly)) return 'Splash! +1';
    }
    for (const z of H.hazards) if (inRect(x, y, z.rect)) return z.msg;
    return null;
  }
  function roughAt(x, y) {
    for (const r of H.rough) {
      if (r.circle && Math.hypot(x - r.circle[0], y - r.circle[1]) < r.circle[2]) return r.k;
      if (r.scrub && y >= r.scrub[0] && y <= r.scrub[1]) {
        let best = null, bd = 1e9;
        for (const p of r.line) { const dd = Math.abs(p[1] - y); if (dd < bd) { bd = dd; best = p; } }
        if (best && (x - best[0]) * r.scrub[2] > H.polys[0].hw - 26) return r.k;
      }
    }
    return 0;
  }
  function slopeAccel(x, y) {
    let ax = 0, ay = 0;
    for (const s of H.slopes) {
      if (s.rect && inRect(x, y, s.rect)) { ax += s.a[0]; ay += s.a[1]; }
      else if (s.circle && Math.hypot(x - s.circle[0], y - s.circle[1]) < s.circle[2]) { ax += s.a[0]; ay += s.a[1]; }
      else if (s.radial) {
        const dx = x - s.radial[0], dy = y - s.radial[1], d = Math.hypot(dx, dy);
        if (d < s.radial[2] && d > 0.1) { ax += dx / d * s.a; ay += dy / d * s.a; }
      }
    }
    if (H.funnel) {
      const dx = H.cup[0] - x, dy = H.cup[1] - y, d = Math.hypot(dx, dy);
      if (d < H.funnel[2] && d > 1) { ax += dx / d * 110; ay += dy / d * 110; }
    }
    return [ax, ay];
  }
  const onGreen = (x, y) => Math.hypot(x - H.cup[0], y - H.cup[1]) < 62;
  function downhillDir(x, y) { // direction back towards the tee along the main path
    const pts = H.polys[0].pts;
    let bi = 1, bd = 1e9;
    for (let i = 1; i < pts.length; i++) { const d = segDist(x, y, [...pts[i - 1], ...pts[i]]); if (d < bd) { bd = d; bi = i; } }
    const dx = pts[bi - 1][0] - pts[bi][0], dy = pts[bi - 1][1] - pts[bi][1], L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  }

  // ---------- sound ----------
  let actx = null;
  function audio() {
    if (!feel.sound) return null;
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null) {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, freq, vol = 0.3, q = 1) {
    const a = audio(); if (!a) return;
    const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination); src.start();
  }
  const sfx = {
    putt: (p) => { noise(0.05, 2400, 0.25 + 0.4 * p, 2); tone(900, 0.05, 'triangle', 0.12); },
    wall: (v) => tone(170 + Math.random() * 30, 0.12, 'triangle', Math.min(0.5, v / 900)),
    sand: () => noise(0.18, 700, 0.18, 0.8),
    roo: () => tone(220, 0.22, 'sine', 0.3, 520),
    kick: () => { tone(160, 0.08, 'square', 0.15); tone(300, 0.25, 'sine', 0.3, 700); },
    jump: () => tone(300, 0.3, 'sine', 0.2, 900),
    land: () => noise(0.08, 500, 0.3, 1),
    cup: () => { tone(1300, 0.06, 'triangle', 0.2); setTimeout(() => tone(1100, 0.06, 'triangle', 0.2), 70); setTimeout(() => tone(260, 0.25, 'sine', 0.35), 140); },
    splash: () => { noise(0.45, 900, 0.5, 0.6); tone(300, 0.3, 'sine', 0.15, 90); },
    fore: () => tone(700, 0.15, 'triangle', 0.12, 500),
    cheer: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.18), i * 90)),
  };
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* ignore */ } };

  // ---------- state ----------
  const ball = { x: 0, y: 0, vx: 0, vy: 0, scale: 1, air: null };
  let state = 'menu'; // menu | loading | ready | aiming | rolling | splash | sinking | done | paused
  let shots = 0, lastPos = { x: 0, y: 0 }, aim = null, wasInSand = false, timer = 0, splashAt = null, overCup = false, rolledBack = false;
  let round = null; // { kind, list: [hole numbers], idx, scores: [] }

  // ---------- layout ----------
  const stage = $('stage'), bg = $('bg'), cv = $('cv'), ctx = cv.getContext('2d'), hud = $('hud'), help = $('help');
  let S = 1, OX = 0, OY = 0, DPR = 1;
  const safeTop = () => {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;top:0;padding-top:env(safe-area-inset-top);visibility:hidden';
    document.body.appendChild(p); const v = parseFloat(getComputedStyle(p).paddingTop) || 0; p.remove(); return v;
  };
  const standalone = () => window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  function viewSize() {
    let W = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    let Hh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
    // an installed iPhone app can report a height that leaves out the status bar; the app really fills the screen
    if (standalone() && screen.height > screen.width && Math.abs(screen.width - W) < 2) Hh = Math.max(Hh, screen.height);
    return [W, Hh];
  }
  function layout() {
    const [W, Hh] = viewSize();
    // fill the screen: zoom in slightly (cropping a few trees off the edges) rather than leave bands
    const fit = Math.min(W / 360, Hh / 760), cover = Math.max(W / 360, Hh / 760);
    S = (360 * cover - W <= W * 0.12 && 760 * cover - Hh <= Hh * 0.12) ? cover : fit;
    OX = (W - 360 * S) / 2; OY = (Hh - 760 * S) / 2;
    stage.style.transform = `translate(${OX}px, ${OY}px) scale(${S})`;
    $('sideL').style.transform = `translate(${OX}px, ${OY}px) scale(${-S}, ${S})`;
    $('sideR').style.transform = `translate(${OX + 720 * S}px, ${OY}px) scale(${-S}, ${S})`;
    DPR = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(360 * S * DPR); cv.height = Math.round(760 * S * DPR);
    hud.style.top = Math.max(OY + 48 * S, safeTop() + 8) + 'px';
    hud.style.width = Math.min(360 * S, W) + 'px'; hud.style.left = Math.max(OX, 0) + 'px';
    help.style.top = (OY + 734 * S) + 'px';
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 250));
  if (window.visualViewport) visualViewport.addEventListener('resize', layout);
  layout(); setTimeout(layout, 300); setTimeout(layout, 1200);

  const img = (src) => { const i = new Image(); i.src = src; return i; };
  const rooImg = img('roo.svg');

  // ---------- holes and rounds ----------
  const holeData = (n) => HOLES[n - 1];
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const parOf = (list) => sum(list.map((n) => holeData(n).par));
  const toParText = (d) => (d === 0 ? 'Level par' : d > 0 ? `+${d} over par` : `${-d} under par`);
  const setBgs = (src) => { bg.src = src; $('sideL').src = src; $('sideR').src = src; };
  function startHole(n) {
    const d = holeData(n);
    state = 'loading';
    H = prepare(d);
    const src = `holes/h${n}.svg`;
    const go = () => {
      Object.assign(ball, { x: H.tee[0], y: H.tee[1], vx: 0, vy: 0, scale: 1, air: null });
      shots = 0; setShots(); lastPos = { x: ball.x, y: ball.y }; aim = null; splashAt = null; state = 'ready';
      $('holeT').textContent = `Hole ${n}`;
      $('holeS').textContent = `Par ${d.par} · ${d.name}`;
      const played = round ? round.scores.length : 0;
      $('roundTot').textContent = played ? `Round: ${sum(round.scores)} (${toParText(sum(round.scores) - parOf(round.list.slice(0, played))).replace(' par', '')})` : '';
      $('roundTot').style.display = played ? '' : 'none';
      help.style.opacity = load('fm.helped', false) ? 0 : 1;
      showIntro(d);
      if (round && round.idx + 1 < round.list.length) img(`holes/h${round.list[round.idx + 1]}.svg`); // warm the next hole
    };
    show('game');
    state = 'loading';
    if (bg.getAttribute('src') === src && bg.complete) go();
    else { bg.onload = () => { bg.onload = null; go(); }; bg.onerror = go; setBgs(src); }
  }
  let introT = null;
  function showIntro(d) {
    $('introT').textContent = `Hole ${d.n}`;
    $('introN').textContent = d.name;
    $('introS').textContent = `Par ${d.par}`;
    $('intro').classList.add('show'); clearTimeout(introT); introT = setTimeout(() => $('intro').classList.remove('show'), 1700);
  }
  function startRound(kind) {
    const list = kind === 'front' ? range(1, 9) : kind === 'back' ? range(10, 18) : range(1, 18);
    round = { kind, list, idx: 0, scores: [] };
    startHole(list[0]);
  }

  // ---------- screens ----------
  const screens = ['home', 'pick', 'game'];
  function show(name) {
    for (const s of screens) $(s).classList.toggle('on', s === name);
    hud.style.display = name === 'game' ? '' : 'none';
    if (name !== 'game') { state = 'menu'; help.style.opacity = 0; $('intro').classList.remove('show'); }
    for (const sh of document.querySelectorAll('.sheet')) sh.classList.remove('show');
  }
  function goHome() {
    round = null; H = null; setBgs('holes/h18.svg');
    const bests = load('fm.rounds', {});
    const fmt = (k, par) => (bests[k] ? `Best ${bests[k]}` : '');
    $('bestFull').textContent = fmt('full', parOf(range(1, 18)));
    $('bestFront').textContent = fmt('front', parOf(range(1, 9)));
    $('bestBack').textContent = fmt('back', parOf(range(10, 18)));
    show('home');
  }
  $('parFull').textContent = `18 holes · par ${parOf(range(1, 18))}`;
  $('parFront').textContent = `Holes 1–9 · par ${parOf(range(1, 9))}`;
  $('parBack').textContent = `Holes 10–18 · par ${parOf(range(10, 18))}`;
  $('playFull').onclick = () => { audio(); startRound('full'); };
  $('playFront').onclick = () => { audio(); startRound('front'); };
  $('playBack').onclick = () => { audio(); startRound('back'); };
  $('playPick').onclick = () => { audio(); buildPick(); show('pick'); };
  $('pickBack').onclick = goHome;
  function buildPick() {
    const g = $('pickGrid'); g.innerHTML = '';
    for (const d of HOLES) {
      const b = document.createElement('button');
      const best = load(`fm.best.${d.n}`, null);
      b.className = 'tile';
      b.innerHTML = `<span class="num">${d.n}</span><span class="nm"></span><span class="pr">Par ${d.par}${best ? ` · best ${best}` : ''}</span>`;
      b.querySelector('.nm').textContent = d.name;
      b.onclick = () => { audio(); round = null; startHole(d.n); };
      g.appendChild(b);
    }
  }

  // ---------- input ----------
  const toWorld = (e) => ({ x: (e.clientX - OX) / S, y: (e.clientY - OY) / S });
  let pointerId = null;
  window.addEventListener('pointerdown', (e) => {
    if (state !== 'ready' || e.target.closest('button, .sheet')) return;
    audio();
    pointerId = e.pointerId;
    const p = toWorld(e);
    aim = { sx: p.x, sy: p.y, dx: 0, dy: 0 };
    state = 'aiming';
    $('intro').classList.remove('show');
  });
  window.addEventListener('pointermove', (e) => {
    if (state !== 'aiming' || e.pointerId !== pointerId) return;
    const p = toWorld(e);
    aim.dx = p.x - aim.sx; aim.dy = p.y - aim.sy;
  });
  const release = (e) => {
    if (state !== 'aiming' || e.pointerId !== pointerId) return;
    pointerId = null;
    const d = Math.hypot(aim.dx, aim.dy);
    if (d < 8 || e.type === 'pointercancel') { aim = null; state = 'ready'; return; }
    const p = Math.min(1, d / MAX_DRAG), fromSand = inSand(ball.x, ball.y);
    const v = feel.power * p * (fromSand ? SAND_OUT : 1);
    let dx = -aim.dx / d, dy = -aim.dy / d;
    if (fromSand) { // random scale each shot, so sometimes it comes out straight
      const a = (Math.random() * 2 - 1) * SAND_SPRAY, c = Math.cos(a), sn = Math.sin(a);
      [dx, dy] = [dx * c - dy * sn, dx * sn + dy * c];
      sfx.sand();
    }
    ball.vx = dx * v; ball.vy = dy * v; overCup = false; rolledBack = false;
    lastPos = { x: ball.x, y: ball.y };
    shots++; setShots(); sfx.putt(p); buzz(8);
    aim = null; state = 'rolling'; wasInSand = fromSand;
    help.style.opacity = 0; save('fm.helped', true);
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // ---------- physics ----------
  function bounceOff(cx, cy, r, restitution) {
    const dx = ball.x - cx, dy = ball.y - cy, dd = Math.hypot(dx, dy), min = r + BALL_R;
    if (dd >= min || dd === 0) return 0;
    const nx = dx / dd, ny = dy / dd;
    ball.x = cx + nx * min; ball.y = cy + ny * min;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) { ball.vx -= (1 + restitution) * vn * nx; ball.vy -= (1 + restitution) * vn * ny; }
    return -vn;
  }
  function step(dt) {
    let sp = Math.hypot(ball.vx, ball.vy);
    if (ball.air) {
      ball.air.left -= sp * dt;
      if (ball.air.left <= 0) { ball.air = null; ball.vx *= 0.75; ball.vy *= 0.75; sfx.land(); }
    } else {
      const sand = inSand(ball.x, ball.y);
      if (sand && !wasInSand) sfx.sand();
      wasInSand = sand;
      const [sax, say] = slopeAccel(ball.x, ball.y);
      ball.vx += sax * dt; ball.vy += say * dt;
      const rough = roughAt(ball.x, ball.y);
      const k = sand ? feel.sand : rough ? feel.grass * rough : feel.grass, a = sand ? 100 * feel.sand : rough ? 55 * rough : 55;
      sp = Math.hypot(ball.vx, ball.vy);
      if (sp > 0) { const nsp = Math.max(0, sp - (a + k * sp) * dt); ball.vx *= nsp / sp; ball.vy *= nsp / sp; sp = nsp; }
      // cup
      const cr = H.cup[2], cdx = H.cup[0] - ball.x, cdy = H.cup[1] - ball.y, cd = Math.hypot(cdx, cdy);
      if (cd < cr + 2 && sp < 45) { ball.vx += cdx / cd * 150 * dt; ball.vy += cdy / cd * 150 * dt; }
      if (cd > cr + 3) overCup = false;
      if (cd < cr - 2.5 && !overCup) {
        if (sp < H.cupDrop) { sink(); return; }
        overCup = true;
        const lip = sp < H.cupLip, side = Math.sign((ball.vx * cdy - ball.vy * cdx) || Math.random() - 0.5);
        const ang = -side * (lip ? 0.4 + Math.random() * 0.6 : 0.15 + Math.random() * 0.3), c = Math.cos(ang), s = Math.sin(ang), k2 = lip ? 0.65 : 0.9;
        [ball.vx, ball.vy] = [(ball.vx * c - ball.vy * s) * k2, (ball.vx * s + ball.vy * c) * k2];
        sfx.wall(lip ? 260 : 140); toast(lip ? 'Lipped out!' : 'Too hot!', 700);
      }
    }
    const py = ball.y;
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    // jump ramps: launch when crossing the lip going up the screen
    if (!ball.air) {
      for (const [jx, jy, jw] of H.jumps) {
        if (py >= jy && ball.y < jy && Math.abs(ball.x - jx) < jw && ball.vy < 0) {
          const dist = Math.min(300, sp * 0.42);
          ball.air = { left: dist, total: dist }; sfx.jump();
        }
      }
    }
    // walls
    const d = sdf(ball.x, ball.y);
    if (d > -BALL_R) {
      const [nx, ny] = sdfNormal(ball.x, ball.y);
      ball.x -= nx * (d + BALL_R); ball.y -= ny * (d + BALL_R);
      const vn = ball.vx * nx + ball.vy * ny;
      if (vn > 0) {
        const tx = ball.vx - vn * nx, ty = ball.vy - vn * ny;
        ball.vx = tx * 0.96 - vn * nx * feel.bounce; ball.vy = ty * 0.96 - vn * ny * feel.bounce;
        if (vn > 40) sfx.wall(vn);
      }
    }
    if (ball.air) return;
    for (const b of H.bodies) { const hit = bounceOff(b[0], b[1], b[2], 0.8); if (hit > 30) sfx.roo(); }
    for (const r of H.rooState) {
      if (r.kind === 'hop' && r.h < 10) {
        const hit = bounceOff(r.x - 3 * r.facing, r.gy - 10, 14, 0.9);
        if (hit > 30) { sfx.roo(); r.squash = 1; }
      }
      if (r.zone && r.awake && r.cool <= 0) {
        const z = r.zone, ex = (ball.x - z.x) / z.rx, ey = (ball.y - z.y) / z.ry;
        if (ex * ex + ey * ey < 1) {
          // always the same boot, so the arrow drawn on the grass is exactly where it goes
          const [kx, ky] = kickVel(r);
          ball.x = r.zone.x; ball.y = r.zone.y; ball.vx = kx; ball.vy = ky;
          r.cool = 0.9; r.squash = 1; sfx.kick(); buzz(20); toast('Kicked!', 700);
        }
      }
    }
    for (const st of H.strays) {
      const u = st.t / st.dur;
      if (u > 0.7 && u < 1) {
        const [x, y] = strayPos(st, u);
        if (Math.hypot(ball.x - x, ball.y - y) < BALL_R + 4) {
          const [ax, ay, bx, by] = st.a, L = Math.hypot(bx - ax, by - ay);
          ball.vx += (bx - ax) / L * 160; ball.vy += (by - ay) / L * 160;
          st.t = st.dur; sfx.fore(); toast('Fore!', 700);
        }
      }
    }
    const hz = hazardAt(ball.x, ball.y);
    if (hz) { splash(hz); return; }
    if (sdf(ball.x, ball.y) > 20) { splash('Out of bounds +1'); return; }
    sp = Math.hypot(ball.vx, ball.vy);
    if (sp < 4) {
      ball.vx = ball.vy = 0;
      if (H.hill && !rolledBack && !onGreen(ball.x, ball.y)) { // the hill rolls it back a little
        rolledBack = true;
        const [dx, dy] = downhillDir(ball.x, ball.y);
        ball.vx = dx * 75; ball.vy = dy * 75;
        return;
      }
      state = 'ready';
    }
  }
  function strayPos(st, u) {
    const [ax, ay, bx, by] = st.a, cx = (ax + bx) / 2, cy = Math.min(ay, by) - 30;
    return [(1 - u) ** 2 * ax + 2 * (1 - u) * u * cx + u * u * bx, (1 - u) ** 2 * ay + 2 * (1 - u) * u * cy + u * u * by];
  }
  function updateRoos(dt) {
    for (const r of H.rooState) {
      if (r.squash > 0) r.squash = Math.max(0, r.squash - dt * 3);
      if (r.kind === 'hop') {
        if (r.hopping) {
          r.t += dt / 0.5;
          const u = Math.min(1, r.t);
          r.x = r.from + (r.to - r.from) * u; r.h = Math.sin(u * Math.PI) * 26;
          if (u >= 1) { r.hopping = false; r.h = 0; r.rest = 0.6 + Math.random() * 1.2; }
        } else if ((r.rest -= dt) <= 0 && r.spots.length > 1) {
          const c = r.spots.filter((s) => s !== r.x);
          r.from = r.x; r.to = c[Math.floor(Math.random() * c.length)];
          r.facing = r.to > r.from ? 1 : -1; r.t = 0; r.hopping = true;
        }
      } else if (r.zone) {
        r.cool -= dt;
        r.crouch = (r.crouch || 0) + ((r.awake ? 0 : 1) - (r.crouch || 0)) * Math.min(1, dt * 8);
        if ((r.timer -= dt) <= 0) { r.awake = !r.awake; r.timer = r.awake ? 1.6 + Math.random() * 0.8 : 1.8 + Math.random() * 1.0; }
      }
    }
    for (const st of H.strays) {
      st.t += dt;
      if (st.t > st.dur + 0.3) st.t = -(1.2 + Math.random() * 2);
    }
  }

  const KICK_SPEED = 260;
  function kickVel(r) {
    if (!r.kick) { const [dx, dy] = downhillDir(r.zone.x, r.zone.y); r.kick = [dx * KICK_SPEED, dy * KICK_SPEED]; }
    return r.kick;
  }
  // where a booted ball ends up: a quick ghost roll with the real walls, slopes and grass
  function kickPath(r) {
    if (r.path) return r.path;
    let x = r.zone.x, y = r.zone.y, [vx, vy] = kickVel(r);
    const pts = [[x, y]], dt = 1 / 120;
    let rolled = false;
    for (let i = 0; i < 900; i++) {
      const [ax, ay] = slopeAccel(x, y); vx += ax * dt; vy += ay * dt;
      const sand = inSand(x, y), rough = roughAt(x, y);
      const k = sand ? feel.sand : rough ? feel.grass * rough : feel.grass, a0 = sand ? 100 * feel.sand : rough ? 55 * rough : 55;
      let sp = Math.hypot(vx, vy); const nsp = Math.max(0, sp - (a0 + k * sp) * dt);
      if (sp > 0) { vx *= nsp / sp; vy *= nsp / sp; } sp = nsp;
      x += vx * dt; y += vy * dt;
      const d = sdf(x, y);
      if (d > -BALL_R) {
        const [nx, ny] = sdfNormal(x, y); x -= nx * (d + BALL_R); y -= ny * (d + BALL_R);
        const vn = vx * nx + vy * ny; if (vn > 0) { vx = (vx - vn * nx) * 0.96 - vn * nx * feel.bounce; vy = (vy - vn * ny) * 0.96 - vn * ny * feel.bounce; }
      }
      if (i % 6 === 0) pts.push([x, y]);
      if (sp < 4) {
        if (H.hill && !rolled && !onGreen(x, y)) { rolled = true; const [dx, dy] = downhillDir(x, y); vx = dx * 75; vy = dy * 75; continue; }
        break;
      }
    }
    pts.push([x, y]);
    return (r.path = pts);
  }
  function drawKickArrow(r) {
    const pts = kickPath(r), n = pts.length;
    if (n < 3) return;
    // start the arrow at the edge of the zone so it reads as leaving it
    let i0 = 0;
    while (i0 < n - 2 && ((pts[i0][0] - r.zone.x) / r.zone.rx) ** 2 + ((pts[i0][1] - r.zone.y) / r.zone.ry) ** 2 < 1) i0++;
    ctx.save();
    ctx.strokeStyle = '#e2485e'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([7, 6]);
    ctx.beginPath(); ctx.moveTo(pts[i0][0], pts[i0][1]);
    for (let i = i0 + 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke(); ctx.setLineDash([]);
    const [x1, y1] = pts[n - 1], [x0, y0] = pts[Math.max(i0, n - 4)], a = Math.atan2(y1 - y0, x1 - x0);
    ctx.beginPath();
    ctx.moveTo(x1 - Math.cos(a - 0.6) * 9, y1 - Math.sin(a - 0.6) * 9); ctx.lineTo(x1, y1); ctx.lineTo(x1 - Math.cos(a + 0.6) * 9, y1 - Math.sin(a + 0.6) * 9);
    ctx.stroke();
    ctx.restore();
  }

  function splash(msg) {
    state = 'splash'; timer = 1.1; splashAt = { x: ball.x, y: ball.y, t: 0, water: msg.startsWith('Splash') };
    ball.vx = ball.vy = 0; ball.air = null; sfx.splash(); buzz(30);
    shots++; setShots(); toast(msg);
  }
  function sink() { state = 'sinking'; timer = 0.45; ball.vx = ball.vy = 0; sfx.cup(); buzz([15, 40, 25]); }

  // ---------- HUD / sheets ----------
  const setShots = () => { $('shots').textContent = shots; };
  let toastT = null;
  function toast(text, ms = 1100) {
    const t = $('toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  function scoreName(n, par) {
    if (n === 1) return 'Hole in one!';
    const d = n - par;
    return ({ '-3': 'Albatross!', '-2': 'Eagle!', '-1': 'Birdie!', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' })[d] || `+${d}`;
  }
  function finish() {
    state = 'done';
    const n = H.n, par = H.par, name = scoreName(shots, par);
    if (shots <= par) sfx.cheer();
    const prev = load(`fm.best.${n}`, null), isBest = prev === null || shots < prev;
    if (isBest) save(`fm.best.${n}`, shots);
    $('endTitle').textContent = name;
    $('endSub').textContent = `Hole ${n} · ${H.name} · Par ${par}`;
    $('endShots').textContent = shots;
    $('endBest').textContent = isBest ? 'Your best on this hole!' : `Your best here: ${prev}`;
    $('endCard').innerHTML = '';
    if (round) {
      round.scores.push(shots);
      const done = round.scores.length === round.list.length;
      $('endCard').appendChild(scorecard(round.list, round.scores));
      $('nextBtn').textContent = done ? 'See scorecard' : `Next: hole ${round.list[round.idx + 1]}`;
      $('nextBtn').style.display = ''; $('againBtn').style.display = 'none'; $('pickBtn').style.display = 'none';
    } else {
      $('nextBtn').style.display = 'none'; $('againBtn').style.display = ''; $('pickBtn').style.display = '';
    }
    $('endSheet').classList.add('show');
  }
  function scorecard(list, scores) {
    const wrap = document.createElement('div'); wrap.className = 'sc';
    for (let i = 0; i < list.length; i += 9) {
      const part = list.slice(i, i + 9), t = document.createElement('table');
      const row = (label, cells, cls = '') => `<tr class="${cls}"><th>${label}</th>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
      const sc = part.map((n, j) => {
        const s = scores[i + j]; if (s === undefined) return '';
        const d = s - holeData(n).par;
        return `<span class="b ${d < 0 ? 'under' : d > 0 ? 'over' : ''}">${s}</span>`;
      });
      const got = scores.slice(i, i + part.length);
      t.innerHTML = row('Hole', [...part, list.length > 9 ? (i === 0 ? 'Out' : 'In') : 'Tot'], 'hd') +
        row('Par', [...part.map((n) => holeData(n).par), parOf(part)]) + row('You', [...sc, got.length ? sum(got) : ''], 'you');
      wrap.appendChild(t);
    }
    return wrap;
  }
  function roundOver() {
    const tot = sum(round.scores), par = parOf(round.list), d = tot - par;
    const bests = load('fm.rounds', {}), isBest = !bests[round.kind] || tot < bests[round.kind];
    if (isBest) { bests[round.kind] = tot; save('fm.rounds', bests); }
    $('rTitle').textContent = d < 0 ? 'Brilliant round!' : d === 0 ? 'Level par!' : 'Round complete';
    $('rSub').textContent = `${round.kind === 'full' ? 'Full 18' : round.kind === 'front' ? 'Front 9' : 'Back 9'} · par ${par}`;
    $('rShots').textContent = tot;
    $('rPar').textContent = toParText(d) + (isBest ? ' · new best round!' : ` · best ${bests[round.kind]}`);
    $('rCard').innerHTML = ''; $('rCard').appendChild(scorecard(round.list, round.scores));
    $('endSheet').classList.remove('show');
    $('roundSheet').classList.add('show');
    if (d <= 0) sfx.cheer();
  }
  $('nextBtn').onclick = () => {
    if (round.scores.length === round.list.length) { roundOver(); return; }
    round.idx++; startHole(round.list[round.idx]);
  };
  $('againBtn').onclick = () => startHole(H.n);
  $('pickBtn').onclick = () => { buildPick(); show('pick'); };
  $('rAgain').onclick = () => startRound(round.kind);
  $('rHome').onclick = goHome;
  let resumeState = 'ready';
  $('pauseBtn').onclick = () => {
    if (state === 'paused' || state === 'menu' || state === 'loading') return;
    resumeState = state === 'aiming' ? 'ready' : state; aim = null; state = 'paused';
    syncTune(); $('menuSheet').classList.add('show');
  };
  $('resumeBtn').onclick = () => { $('menuSheet').classList.remove('show'); state = resumeState; };
  $('restartBtn').onclick = () => {
    if (round && round.scores.length > round.idx) round.scores.length = round.idx;
    startHole(H.n);
  };
  $('quitBtn').onclick = goHome;
  const TUNE = [['tPower', 'vPower', 'power', (v) => Math.round(v / 6.2) + '%'], ['tGrass', 'vGrass', 'grass', (v) => v.toFixed(2)],
    ['tSand', 'vSand', 'sand', (v) => v.toFixed(2)], ['tBounce', 'vBounce', 'bounce', (v) => Math.round(v * 100) + '%'],
    ['tSound', 'vSound', 'sound', (v) => (v ? 'on' : 'off')]];
  function syncTune() { for (const [i, o, k, f] of TUNE) { $(i).value = feel[k]; $(o).textContent = f(feel[k]); } }
  for (const [i, o, k, f] of TUNE) $(i).addEventListener('input', () => { if (H) H.rooState.forEach((r) => { r.path = null; }); feel[k] = parseFloat($(i).value); $(o).textContent = f(feel[k]); save('fm.feel', feel); });
  $('defaultsBtn').onclick = () => { feel = { ...DEFAULTS }; save('fm.feel', feel); syncTune(); };
  $('ver').textContent = VERSION;
  $('homeVer').textContent = VERSION;

  // ---------- drawing ----------
  const lerp = (a, b, t) => a + (b - a) * t;
  function powerColor(p) {
    const g = [111, 211, 106], c = [255, 107, 127];
    return `rgb(${Math.round(lerp(g[0], c[0], p))},${Math.round(lerp(g[1], c[1], p))},${Math.round(lerp(g[2], c[2], p))})`;
  }
  function drawBall(x, y, s = 1, lift = 0) {
    ctx.save();
    ctx.fillStyle = `rgba(47,90,34,${0.28 - lift / 300})`;
    ctx.beginPath(); ctx.ellipse(x + (6 + lift * 0.9) * s, y + (5 + lift * 0.7) * s, 11 * s, 4.5 * s, 0.5, 0, Math.PI * 2); ctx.fill();
    const k = s * (1 + lift / 45);
    const g = ctx.createRadialGradient(x - 2.5 * k, y - 3 * k, 0.5, x, y, BALL_R * k * 1.2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#efe3c8');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, BALL_R * k, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawAim() {
    const d = Math.hypot(aim.dx, aim.dy);
    if (d < 4) return;
    const p = Math.min(1, d / MAX_DRAG), ux = aim.dx / d, uy = aim.dy / d, pull = Math.min(d, MAX_DRAG);
    const ex = ball.x + ux * pull, ey = ball.y + uy * pull, nx = -uy, ny = ux, w0 = 6.5 - 3 * p, w1 = 2.5;
    ctx.fillStyle = 'rgba(255,248,230,.85)';
    ctx.beginPath();
    ctx.moveTo(ball.x + nx * w0, ball.y + ny * w0); ctx.lineTo(ex + nx * w1, ey + ny * w1);
    ctx.arc(ex, ey, w1, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
    ctx.lineTo(ball.x - nx * w0, ball.y - ny * w0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff8e6'; ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2); ctx.fill();
    const sandy = inSand(ball.x, ball.y), len = (26 + 84 * p) * (sandy ? SAND_OUT : 1), ax = -ux, ay = -uy;
    const sx = ball.x + ax * (BALL_R + 4), sy = ball.y + ay * (BALL_R + 4), tx = sx + ax * len, ty = sy + ay * len, hw = 4 + 2 * p, hh = 12;
    const arrow = (ox, oy) => {
      ctx.beginPath();
      ctx.moveTo(sx + nx * hw * 0.6 + ox, sy + ny * hw * 0.6 + oy);
      ctx.lineTo(tx - ax * hh + nx * hw + ox, ty - ay * hh + ny * hw + oy);
      ctx.lineTo(tx - ax * hh + nx * hw * 2.3 + ox, ty - ay * hh + ny * hw * 2.3 + oy);
      ctx.lineTo(tx + ox, ty + oy);
      ctx.lineTo(tx - ax * hh - nx * hw * 2.3 + ox, ty - ay * hh - ny * hw * 2.3 + oy);
      ctx.lineTo(tx - ax * hh - nx * hw + ox, ty - ay * hh - ny * hw + oy);
      ctx.lineTo(sx - nx * hw * 0.6 + ox, sy - ny * hw * 0.6 + oy);
      ctx.closePath(); ctx.fill();
    };
    ctx.fillStyle = 'rgba(47,90,34,.22)'; arrow(7, 6);
    ctx.fillStyle = powerColor(p); arrow(0, 0);
    if (sandy) { // spray cone: the shot can come out anywhere in here
      const base = Math.atan2(ay, ax), r = len + 55;
      ctx.fillStyle = 'rgba(255,236,180,.35)';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.arc(sx, sy, r, base - SAND_SPRAY, base + SAND_SPRAY); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,248,230,.95)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(base + sgn * SAND_SPRAY) * r, sy + Math.sin(base + sgn * SAND_SPRAY) * r); ctx.stroke(); }
      ctx.setLineDash([]);
    }
  }
  function drawRooSprite(x, feetY, scale, facing, tilt = 0, squash = 0, crouch = 0) {
    if (!rooImg.complete) return;
    ctx.save();
    const sq = squash * 0.12;
    ctx.translate(x, feetY);
    // crouch: squat lower and tip the head down to the grass
    ctx.scale(-facing * scale * (1 + sq + 0.08 * crouch), scale * (1 - sq - 0.28 * crouch));
    ctx.rotate(tilt - 0.45 * crouch);
    ctx.drawImage(rooImg, -30, -52 - 46, 104, 100);
    ctx.restore();
  }
  function longShadow(x, y, s) {
    ctx.fillStyle = 'rgba(47,90,34,.22)';
    ctx.beginPath(); ctx.moveTo(x - 22 * s, y); ctx.bezierCurveTo(x + 10 * s, y - 6 * s, x + 60 * s, y + 4 * s, x + 96 * s, y + 28 * s);
    ctx.bezierCurveTo(x + 80 * s, y + 36 * s, x + 30 * s, y + 26 * s, x - 18 * s, y + 6 * s); ctx.closePath(); ctx.fill();
  }
  function drawRoos() {
    for (const r of H.rooState) {
      if (r.kind === 'hop') {
        const sh = 1 - r.h / 60;
        ctx.fillStyle = 'rgba(47,90,34,.22)';
        ctx.beginPath(); ctx.ellipse(r.x + 10, r.gy + 2, 22 * sh, 5 * sh, 0.15, 0, Math.PI * 2); ctx.fill();
        drawRooSprite(r.x, r.gy - r.h, 0.68, r.facing, r.hopping ? -0.18 : 0, r.squash);
      } else if (r.zone) {
        const z = r.zone;
        ctx.save();
        ctx.beginPath(); ctx.ellipse(z.x, z.y, z.rx, z.ry, 0, 0, Math.PI * 2);
        if (r.awake) { // watching: faint red zone and the kick it will give you
          ctx.fillStyle = 'rgba(255,90,110,.28)'; ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
        } else { // grazing: just a faint dashed outline
          ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2; ctx.setLineDash([5, 7]); ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.restore();
        if (r.awake) drawKickArrow(r);
        const face = r.awake ? -1 : 1; // faces the lane when watching, turns away to graze
        if (r.kind === 'kick') { longShadow(r.x, r.y + 32, 0.7); drawRooSprite(r.x, r.y + 46 * 0.7, 0.7, face, 0, r.squash, r.crouch); }
        else {
          longShadow(r.x + 12, r.y + 30, 0.64); drawRooSprite(r.x + 12, r.y + 46 * 0.64, 0.64, face, 0, r.squash, r.crouch);
          drawRooSprite(r.x - 26, r.y + 10 + 46 * 0.58, 0.58, -face, 0, r.squash, r.crouch);
        }
        if (!r.awake) {
          ctx.fillStyle = '#fff'; ctx.font = "800 12px 'Baloo 2', sans-serif"; ctx.textAlign = 'center';
          ctx.fillText('munch munch', r.x, r.y - 22); ctx.textAlign = 'start';
        }
      }
    }
  }
  function drawStrays() {
    for (const st of H.strays) {
      if (st.t <= 0 || st.t >= st.dur) continue;
      const u = st.t / st.dur, [x, y] = strayPos(st, u), lift = Math.sin(u * Math.PI) * 26;
      ctx.fillStyle = 'rgba(47,90,34,.25)'; ctx.beginPath(); ctx.ellipse(x + 5 + lift * 0.6, y + 6 + lift * 0.5, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 4 + lift / 30, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawFlag() {
    const [x, y, r] = H.cup, big = r > 12, top = big ? 58 : 54;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x, y - top); ctx.stroke();
    ctx.fillStyle = H.flag || '#ff6b7f';
    ctx.beginPath(); ctx.moveTo(x + 2, y - top + 2); ctx.lineTo(x + (big ? 34 : 32), y - top + (big ? 12 : 11)); ctx.lineTo(x + 2, y - top + (big ? 23 : 22)); ctx.closePath(); ctx.fill();
  }
  function drawSplash() {
    if (!splashAt) return;
    const t = splashAt.t;
    ctx.save();
    ctx.strokeStyle = splashAt.water ? `rgba(232,248,255,${Math.max(0, 1 - t)})` : `rgba(120,100,70,${Math.max(0, 1 - t)})`; ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) { const r = 4 + t * 40 - i * 8; if (r > 0) { ctx.beginPath(); ctx.ellipse(splashAt.x, splashAt.y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); } }
    ctx.fillStyle = splashAt.water ? `rgba(255,255,255,${Math.max(0, 0.9 - t)})` : `rgba(160,130,90,${Math.max(0, 0.9 - t)})`;
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2, r = 6 + t * 26;
      ctx.beginPath(); ctx.arc(splashAt.x + Math.cos(a) * r, splashAt.y + Math.sin(a) * r * 0.6 - Math.sin(t * Math.PI) * 14, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function draw() {
    ctx.setTransform(S * DPR, 0, 0, S * DPR, 0, 0);
    ctx.clearRect(0, 0, 360, 760);
    if (!H || state === 'loading' || state === 'menu') return;
    const lift = ball.air ? Math.sin((1 - ball.air.left / ball.air.total) * Math.PI) * Math.min(40, ball.air.total * 0.18) : 0;
    if (state === 'splash') { drawSplash(); if (splashAt.t > 0.55) drawBall(lastPos.x, lastPos.y, Math.min(1, (splashAt.t - 0.55) * 3)); }
    else if (state === 'sinking') drawBall(ball.x, ball.y, ball.scale);
    else if (state !== 'done' && !ball.air) drawBall(ball.x, ball.y);
    drawFlag(); drawRoos(); drawStrays();
    if (ball.air && state === 'rolling') drawBall(ball.x, ball.y, 1, lift); // flying balls pass over everything
    if (state === 'aiming' && aim) drawAim();
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (H && state !== 'paused' && state !== 'menu' && state !== 'loading') {
      updateRoos(dt);
      if (state === 'rolling') {
        const n = Math.max(1, Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / 2));
        for (let i = 0; i < n && state === 'rolling'; i++) step(dt / n);
      } else if (state === 'splash') {
        splashAt.t += dt; timer -= dt;
        if (timer <= 0) { ball.x = lastPos.x; ball.y = lastPos.y; splashAt = null; state = 'ready'; }
      } else if (state === 'sinking') {
        timer -= dt;
        ball.x = lerp(ball.x, H.cup[0], 0.3); ball.y = lerp(ball.y, H.cup[1], 0.3);
        ball.scale = Math.max(0, timer / 0.45);
        if (timer <= 0) { toast(scoreName(shots, H.par), 900); setTimeout(finish, 700); state = 'done'; }
      }
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  goHome();

  // test hook for automated checks
  // headless helpers for automated checks: putt in a direction and run the physics to rest
  function simShot(ang, p) {
    if (state !== 'ready') return state;
    ball.vx = Math.cos(ang) * feel.power * p * (inSand(ball.x, ball.y) ? SAND_OUT : 1); ball.vy = Math.sin(ang) * feel.power * p * (inSand(ball.x, ball.y) ? SAND_OUT : 1);
    overCup = false; rolledBack = false; lastPos = { x: ball.x, y: ball.y }; shots++; state = 'rolling';
    for (let t = 0; t < 20 && state === 'rolling'; t += 1 / 240) { updateRoos(1 / 240); const n = Math.max(1, Math.ceil(Math.hypot(ball.vx, ball.vy) / 240 / 2)); for (let i = 0; i < n && state === 'rolling'; i++) step(1 / 240 / n); }
    if (state === 'splash') { ball.x = lastPos.x; ball.y = lastPos.y; splashAt = null; state = 'ready'; return 'splash'; }
    return state;
  }
  window.__fm = { ball, get state() { return state; }, get shots() { return shots; }, get H() { return H; }, sdf: (x, y) => sdf(x, y), inSand, hazardAt, feel, startHole, startRound, goHome, simShot, get round() { return round; } };
})();

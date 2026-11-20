/* Federal Minigolf: Hole 1, The Opener.
   World units match the design: a 360 x 760 portrait screen, green near the top. */
(() => {
  'use strict';
  const VERSION = 'v0.1 · hole 1 feel test';

  // ---------- feel settings (tunable from the pause menu) ----------
  const DEFAULTS = { power: 620, grass: 1.1, sand: 4, bounce: 0.72, sound: 1 };
  let feel = { ...DEFAULTS };
  try { Object.assign(feel, JSON.parse(localStorage.getItem('fm.feel') || '{}')); } catch (e) { /* private mode */ }
  const saveFeel = () => { try { localStorage.setItem('fm.feel', JSON.stringify(feel)); } catch (e) { /* ignore */ } };

  // ---------- hole definition ----------
  const HOLE = {
    num: 1, par: 4, name: 'The Opener',
    tee: { x: 210, y: 684 },
    cup: { x: 107, y: 287, r: 9 },
    // fairway centre line (same path as the art) and its half width to the inside of the timber
    path: [['M', 210, 705], ['L', 210, 470], ['Q', 210, 375, 130, 352], ['L', 112, 340]],
    halfWidth: 46,
    circles: [{ x: 100, y: 290, r: 58 }, { x: 116, y: 442, r: 32 }], // green, pond pocket
    // downhill off the tee (the chevrons on the first leg)
    slopes: [{ x0: 160, x1: 260, y0: 560, y1: 705, ax: 0, ay: -26 }],
    roo: { y: 604, spots: [180, 210, 240] },
  };
  const BUNKER_D = 'M-50 -6 C-52 -30 -14 -36 6 -26 C22 -18 34 -34 50 -22 C64 -10 56 22 30 28 C8 34 -10 26 -26 28 C-44 30 -48 14 -50 -6Z';
  const POND_D = 'M-66 -4 C-70 -36 -30 -50 4 -44 C40 -40 70 -30 68 0 C66 32 34 48 0 46 C-34 44 -62 28 -66 -4Z';
  const GREEN_CLIP = { x: 103, y: 293, r: 62 };
  const SAND = [
    { x: 178, y: 505, rot: 82, sx: 0.72, sy: 0.72 },
    { x: 58, y: 296, rot: 82, sx: 0.6, sy: 0.6, clip: GREEN_CLIP },
    { x: 144, y: 300, rot: -80, sx: 0.55, sy: 0.55, clip: GREEN_CLIP },
  ];
  const WATER = [{ x: 152, y: 444, rot: 0, sx: 0.8 * 0.94, sy: 0.62 * 0.94 }];

  const BALL_R = 7.5;

  // ---------- geometry ----------
  function samplePath(segs, step = 6) {
    const pts = []; let cur = null;
    for (const s of segs) {
      if (s[0] === 'M') { cur = [s[1], s[2]]; pts.push(cur); }
      else if (s[0] === 'L') {
        const [x0, y0] = cur, x1 = s[1], y1 = s[2];
        const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
        for (let t = 1; t <= n; t++) pts.push([x0 + (x1 - x0) * t / n, y0 + (y1 - y0) * t / n]);
        cur = [x1, y1];
      } else {
        const [x0, y0] = cur, [cx, cy, x1, y1] = s.slice(1);
        for (let t = 1; t <= 30; t++) {
          const u = t / 30;
          pts.push([(1 - u) ** 2 * x0 + 2 * (1 - u) * u * cx + u * u * x1, (1 - u) ** 2 * y0 + 2 * (1 - u) * u * cy + u * u * y1]);
        }
        cur = [x1, y1];
      }
    }
    return pts;
  }
  const SEGS = (() => {
    const p = samplePath(HOLE.path), out = [];
    for (let i = 0; i < p.length - 1; i++) out.push([p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]]);
    return out;
  })();
  function segDist(px, py, s) {
    const dx = s[2] - s[0], dy = s[3] - s[1];
    const L2 = dx * dx + dy * dy || 1;
    let t = ((px - s[0]) * dx + (py - s[1]) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (s[0] + dx * t), py - (s[1] + dy * t));
  }
  // signed distance to the play area: negative inside, positive beyond the walls
  function sdf(x, y) {
    let d = Infinity;
    for (const s of SEGS) d = Math.min(d, segDist(x, y, s) - HOLE.halfWidth);
    for (const c of HOLE.circles) d = Math.min(d, Math.hypot(x - c.x, y - c.y) - c.r);
    return d;
  }
  function sdfNormal(x, y) {
    const e = 0.5;
    const nx = sdf(x + e, y) - sdf(x - e, y), ny = sdf(x, y + e) - sdf(x, y - e);
    const L = Math.hypot(nx, ny) || 1;
    return [nx / L, ny / L];
  }

  // hit tests for sand and water using the real art shapes
  const hitCtx = document.createElement('canvas').getContext('2d');
  const bunkerPath = new Path2D(BUNKER_D), pondPath = new Path2D(POND_D);
  function inShape(path, shapes, x, y) {
    for (const s of shapes) {
      if (s.clip && Math.hypot(x - s.clip.x, y - s.clip.y) > s.clip.r) continue;
      // transform the point into the shape's local frame
      const a = -s.rot * Math.PI / 180, dx = x - s.x, dy = y - s.y;
      const lx = (dx * Math.cos(a) - dy * Math.sin(a)) / s.sx;
      const ly = (dx * Math.sin(a) + dy * Math.cos(a)) / s.sy;
      if (hitCtx.isPointInPath(path, lx, ly)) return true;
    }
    return false;
  }
  const inSand = (x, y) => inShape(bunkerPath, SAND, x, y);
  const inWater = (x, y) => inShape(pondPath, WATER, x, y);

  // ---------- sound (tiny synth, no files) ----------
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
    cup: () => { tone(1300, 0.06, 'triangle', 0.2); setTimeout(() => tone(1100, 0.06, 'triangle', 0.2), 70); setTimeout(() => tone(260, 0.25, 'sine', 0.35), 140); },
    splash: () => { noise(0.45, 900, 0.5, 0.6); tone(300, 0.3, 'sine', 0.15, 90); },
    cheer: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.18), i * 90)),
  };
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* ignore */ } };

  // ---------- state ----------
  const ball = { x: HOLE.tee.x, y: HOLE.tee.y, vx: 0, vy: 0, scale: 1 };
  let state = 'ready'; // ready | aiming | rolling | splash | sinking | done | paused
  let shots = 0, lastPos = { ...HOLE.tee }, aim = null, wasInSand = false, timer = 0, splashAt = null;
  let best = null;
  try { best = JSON.parse(localStorage.getItem('fm.best.1') || 'null'); } catch (e) { /* ignore */ }

  const roo = { x: 210, h: 0, from: 210, to: 210, t: 0, rest: 1.2, hopping: false, facing: -1, squash: 0 };
  function updateRoo(dt) {
    if (roo.squash > 0) roo.squash = Math.max(0, roo.squash - dt * 3);
    if (roo.hopping) {
      roo.t += dt / 0.5;
      const u = Math.min(1, roo.t);
      roo.x = roo.from + (roo.to - roo.from) * u;
      roo.h = Math.sin(u * Math.PI) * 26;
      if (u >= 1) { roo.hopping = false; roo.h = 0; roo.rest = 0.6 + Math.random() * 1.2; }
    } else {
      roo.rest -= dt;
      if (roo.rest <= 0) {
        const choices = HOLE.roo.spots.filter((s) => s !== roo.x);
        roo.from = roo.x; roo.to = choices[Math.floor(Math.random() * choices.length)];
        roo.facing = roo.to > roo.from ? 1 : -1; roo.t = 0; roo.hopping = true;
      }
    }
  }
  const rooBody = () => ({ x: roo.x - 3 * roo.facing, y: HOLE.roo.y - 10, r: 14 });

  // ---------- layout ----------
  const stage = document.getElementById('stage');
  const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
  const hud = document.getElementById('hud'), help = document.getElementById('help');
  let S = 1, OX = 0, OY = 0, DPR = 1;
  const safeTop = () => {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;top:0;padding-top:env(safe-area-inset-top);visibility:hidden';
    document.body.appendChild(p); const v = parseFloat(getComputedStyle(p).paddingTop) || 0; p.remove(); return v;
  };
  function layout() {
    const W = window.innerWidth, H = window.innerHeight;
    S = Math.min(W / 360, H / 760);
    OX = (W - 360 * S) / 2; OY = (H - 760 * S) / 2;
    stage.style.transform = `translate(${OX}px, ${OY}px) scale(${S})`;
    // mirrored, softened copies of the art fill any side gaps so the trees carry on
    document.getElementById('sideL').style.transform = `translate(${OX}px, ${OY}px) scale(${-S}, ${S})`;
    document.getElementById('sideR').style.transform = `translate(${OX + 720 * S}px, ${OY}px) scale(${-S}, ${S})`;
    DPR = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(360 * S * DPR); cv.height = Math.round(760 * S * DPR);
    hud.style.top = Math.max(OY + 48 * S, safeTop() + 8) + 'px';
    hud.style.maxWidth = 360 * S + 'px'; hud.style.left = OX + 'px';
    help.style.top = (OY + 728 * S) + 'px';
  }
  window.addEventListener('resize', layout);
  layout();

  // ---------- sprites ----------
  const img = (src) => { const i = new Image(); i.src = src; return i; };
  const rooImg = img('roo.svg'), flagImg = img('flag.svg');

  // ---------- input ----------
  const MAX_DRAG = 120; // world units of pull for full power
  const toWorld = (e) => ({ x: (e.clientX - OX) / S, y: (e.clientY - OY) / S });
  let pointerId = null;
  window.addEventListener('pointerdown', (e) => {
    if (state !== 'ready' || e.target.closest('button, .sheet')) return;
    audio();
    pointerId = e.pointerId;
    const p = toWorld(e);
    aim = { sx: p.x, sy: p.y, dx: 0, dy: 0 };
    state = 'aiming';
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
    const p = Math.min(1, d / MAX_DRAG), v = feel.power * p;
    ball.vx = -aim.dx / d * v; ball.vy = -aim.dy / d * v;
    lastPos = { x: ball.x, y: ball.y };
    shots++; setShots(); sfx.putt(p); buzz(8);
    aim = null; state = 'rolling'; wasInSand = inSand(ball.x, ball.y);
    help.style.opacity = 0;
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // ---------- physics ----------
  function step(dt) {
    const sand = inSand(ball.x, ball.y);
    if (sand && !wasInSand) sfx.sand();
    wasInSand = sand;
    // slope
    for (const s of HOLE.slopes) {
      if (ball.x > s.x0 && ball.x < s.x1 && ball.y > s.y0 && ball.y < s.y1) { ball.vx += s.ax * dt; ball.vy += s.ay * dt; }
    }
    // rolling resistance: constant + speed-proportional drag
    const k = sand ? feel.sand : feel.grass, a = sand ? 100 * feel.sand : 55;
    let sp = Math.hypot(ball.vx, ball.vy);
    if (sp > 0) {
      const nsp = Math.max(0, sp - (a + k * sp) * dt);
      ball.vx *= nsp / sp; ball.vy *= nsp / sp; sp = nsp;
    }
    // cup: gentle pull near the rim, sink if slow enough
    const cdx = HOLE.cup.x - ball.x, cdy = HOLE.cup.y - ball.y, cd = Math.hypot(cdx, cdy);
    if (cd < HOLE.cup.r + 3 && sp < 140) { ball.vx += cdx / cd * 260 * dt; ball.vy += cdy / cd * 260 * dt; }
    if (cd < HOLE.cup.r - 1) {
      if (sp < 250) { sink(); return; }
      if (cd < 5) { // lip out: knock it off line and slow it
        const ang = (Math.random() - 0.5) * 1.2, c = Math.cos(ang), s = Math.sin(ang);
        const vx = ball.vx * c - ball.vy * s, vy = ball.vx * s + ball.vy * c;
        ball.vx = vx * 0.6; ball.vy = vy * 0.6; sfx.wall(200);
      }
    }
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
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
    // kangaroo (only when it is on the ground)
    if (roo.h < 10) {
      const b = rooBody(), dx = ball.x - b.x, dy = ball.y - b.y, dd = Math.hypot(dx, dy), min = b.r + BALL_R;
      if (dd < min && dd > 0) {
        const nx = dx / dd, ny = dy / dd;
        ball.x = b.x + nx * min; ball.y = b.y + ny * min;
        const vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) {
          ball.vx -= 1.9 * vn * nx; ball.vy -= 1.9 * vn * ny;
          if (-vn > 30) { sfx.roo(); roo.squash = 1; }
        }
      }
    }
    // water
    if (inWater(ball.x, ball.y)) { splash(); return; }
    // stopped?
    sp = Math.hypot(ball.vx, ball.vy);
    if (sp < 4) { ball.vx = ball.vy = 0; state = 'ready'; }
  }

  function splash() {
    state = 'splash'; timer = 1.1; splashAt = { x: ball.x, y: ball.y, t: 0 };
    ball.vx = ball.vy = 0; sfx.splash(); buzz(30);
    shots++; setShots(); toast('Splash! +1');
  }
  function sink() {
    state = 'sinking'; timer = 0.45; ball.vx = ball.vy = 0; sfx.cup(); buzz([15, 40, 25]);
  }

  // ---------- HUD / sheets ----------
  const $ = (id) => document.getElementById(id);
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
    const name = scoreName(shots, HOLE.par);
    if (shots <= HOLE.par) sfx.cheer();
    const isBest = best === null || shots < best;
    if (isBest) { best = shots; try { localStorage.setItem('fm.best.1', String(best)); } catch (e) { /* ignore */ } }
    $('endTitle').textContent = name;
    $('endSub').textContent = `Hole ${HOLE.num} · ${HOLE.name} · Par ${HOLE.par}`;
    $('endShots').textContent = shots;
    $('endBest').textContent = isBest ? 'New best!' : `Your best: ${best}`;
    $('endSheet').classList.add('show');
  }
  function reset() {
    Object.assign(ball, { x: HOLE.tee.x, y: HOLE.tee.y, vx: 0, vy: 0, scale: 1 });
    shots = 0; setShots(); lastPos = { ...HOLE.tee }; aim = null; splashAt = null; state = 'ready';
    help.style.opacity = 1;
  }
  $('againBtn').onclick = () => { $('endSheet').classList.remove('show'); reset(); };
  let resumeState = 'ready';
  $('pauseBtn').onclick = () => {
    if (state === 'paused') return;
    resumeState = state === 'aiming' ? 'ready' : state; aim = null; state = 'paused';
    syncTune(); $('menuSheet').classList.add('show');
  };
  $('resumeBtn').onclick = () => { $('menuSheet').classList.remove('show'); state = resumeState; };
  $('restartBtn').onclick = () => { $('menuSheet').classList.remove('show'); $('endSheet').classList.remove('show'); reset(); };
  const TUNE = [['tPower', 'vPower', 'power', (v) => Math.round(v / 6.2) + '%'], ['tGrass', 'vGrass', 'grass', (v) => v.toFixed(2)],
    ['tSand', 'vSand', 'sand', (v) => v.toFixed(2)], ['tBounce', 'vBounce', 'bounce', (v) => Math.round(v * 100) + '%'],
    ['tSound', 'vSound', 'sound', (v) => (v ? 'on' : 'off')]];
  function syncTune() {
    for (const [i, o, k, f] of TUNE) { $(i).value = feel[k]; $(o).textContent = f(feel[k]); }
  }
  for (const [i, o, k, f] of TUNE) {
    $(i).addEventListener('input', () => { feel[k] = parseFloat($(i).value); $(o).textContent = f(feel[k]); saveFeel(); });
  }
  $('defaultsBtn').onclick = () => { feel = { ...DEFAULTS }; saveFeel(); syncTune(); };
  $('ver').textContent = VERSION;

  // ---------- drawing ----------
  const lerp = (a, b, t) => a + (b - a) * t;
  function powerColor(p) {
    const g = [111, 211, 106], c = [255, 107, 127];
    return `rgb(${Math.round(lerp(g[0], c[0], p))},${Math.round(lerp(g[1], c[1], p))},${Math.round(lerp(g[2], c[2], p))})`;
  }
  function drawBall(x, y, s = 1) {
    ctx.save();
    ctx.fillStyle = 'rgba(47,90,34,.28)';
    ctx.beginPath(); ctx.ellipse(x + 6 * s, y + 5 * s, 11 * s, 4.5 * s, 0.5, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(x - 2.5 * s, y - 3 * s, 0.5, x, y, BALL_R * s * 1.2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#efe3c8');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, BALL_R * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawAim() {
    const d = Math.hypot(aim.dx, aim.dy);
    if (d < 4) return;
    const p = Math.min(1, d / MAX_DRAG), ux = aim.dx / d, uy = aim.dy / d, pull = Math.min(d, MAX_DRAG);
    // stretchy pull band from the ball back towards the finger
    const ex = ball.x + ux * pull, ey = ball.y + uy * pull, nx = -uy, ny = ux, w0 = 6.5 - 3 * p, w1 = 2.5;
    ctx.fillStyle = 'rgba(255,248,230,.85)';
    ctx.beginPath();
    ctx.moveTo(ball.x + nx * w0, ball.y + ny * w0); ctx.lineTo(ex + nx * w1, ey + ny * w1);
    ctx.arc(ex, ey, w1, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
    ctx.lineTo(ball.x - nx * w0, ball.y - ny * w0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff8e6'; ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2); ctx.fill();
    // power arrow in the shot direction, with its long sunset shadow
    const len = 26 + 84 * p, ax = -ux, ay = -uy, sx = ball.x + ax * (BALL_R + 4), sy = ball.y + ay * (BALL_R + 4);
    const tx = sx + ax * len, ty = sy + ay * len, hw = 4 + 2 * p, hh = 12;
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
  }
  function drawRoo() {
    if (!rooImg.complete) return;
    const s = 0.68, gy = HOLE.roo.y;
    // shadow on the ground, shrinks as it hops
    const sh = 1 - roo.h / 60;
    ctx.fillStyle = 'rgba(47,90,34,.22)';
    ctx.beginPath(); ctx.ellipse(roo.x + 10, gy + 2, 22 * sh, 5 * sh, 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    const sq = roo.squash * 0.12;
    ctx.translate(roo.x, gy - roo.h);
    ctx.scale(-roo.facing * s * (1 + sq), s * (1 - sq));
    ctx.rotate(roo.hopping ? -0.18 : 0);
    // roo.svg viewBox is -30 -52 104 100; feet sit at y = 46
    ctx.drawImage(rooImg, -30, -52 - 46, 104, 100);
    ctx.restore();
  }
  function drawSplash() {
    if (!splashAt) return;
    const t = splashAt.t;
    ctx.save();
    ctx.strokeStyle = `rgba(232,248,255,${Math.max(0, 1 - t)})`; ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      const r = 4 + (t * 40) - i * 8;
      if (r > 0) { ctx.beginPath(); ctx.ellipse(splashAt.x, splashAt.y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 0.9 - t)})`;
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2, r = 6 + t * 26;
      ctx.beginPath(); ctx.arc(splashAt.x + Math.cos(a) * r, splashAt.y + Math.sin(a) * r * 0.6 - Math.sin(t * Math.PI) * 14, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function draw() {
    ctx.setTransform(S * DPR, 0, 0, S * DPR, 0, 0);
    ctx.clearRect(0, 0, 360, 760);
    if (state === 'splash') drawSplash();
    else if (state === 'sinking') drawBall(ball.x, ball.y, ball.scale);
    else if (state !== 'done') drawBall(ball.x, ball.y);
    if (state === 'splash' && splashAt.t > 0.55) drawBall(lastPos.x, lastPos.y, Math.min(1, (splashAt.t - 0.55) * 3));
    if (flagImg.complete) ctx.drawImage(flagImg, 100, 228, 44, 62);
    drawRoo();
    if (state === 'aiming' && aim) drawAim();
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state !== 'paused') {
      updateRoo(dt);
      if (state === 'rolling') {
        const n = Math.max(1, Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / 2));
        for (let i = 0; i < n && state === 'rolling'; i++) step(dt / n);
      } else if (state === 'splash') {
        splashAt.t += dt; timer -= dt;
        if (timer <= 0) { ball.x = lastPos.x; ball.y = lastPos.y; splashAt = null; state = 'ready'; }
      } else if (state === 'sinking') {
        timer -= dt;
        ball.x = lerp(ball.x, HOLE.cup.x, 0.3); ball.y = lerp(ball.y, HOLE.cup.y, 0.3);
        ball.scale = Math.max(0, timer / 0.45);
        if (timer <= 0) { toast(scoreName(shots, HOLE.par), 900); setTimeout(finish, 700); state = 'done'; }
      }
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // test hook for automated checks
  window.__fm = { ball, get state() { return state; }, get shots() { return shots; }, sdf, inSand, inWater, HOLE, feel };
})();

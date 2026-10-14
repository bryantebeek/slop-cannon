// SLOP CANNON — 3D scene: projection, sprites, particles, audio and all canvas drawing.
'use strict';
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const MONO = '"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace', DISP = 'Orbitron,"JetBrains Mono",sans-serif';
const rand = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.random() * a.length | 0];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;

// ───────────── number formatting ─────────────
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc', 'Vg'];
let NOTATION = 'suffix';
function fmt(n, dec = 2) {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n, dec);
  if (n < 1e3) return n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString();
  if (n < 1e6) return Math.floor(n).toLocaleString('en-US');
  const e = Math.floor(Math.log10(n) + 1e-9);
  if (NOTATION === 'sci' || e >= SUFFIX.length * 3) return (n / Math.pow(10, e)).toFixed(dec) + 'e' + e;
  const k = Math.floor(e / 3), m = n / Math.pow(10, k * 3);
  return m.toFixed(m >= 100 ? 0 : m >= 10 ? 1 : dec) + SUFFIX[k];
}
const money = n => '$' + fmt(n);
window.fmt = fmt;

// ───────────── sprites ─────────────
function mk(w, h, f) { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d')); return c; }
const glow = (r, g, b) => mk(64, 64, x => {
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${Math.min(255, r + 140)},${Math.min(255, g + 140)},${Math.min(255, b + 140)},1)`);
  gr.addColorStop(.2, `rgba(${r},${g},${b},.75)`); gr.addColorStop(.5, `rgba(${r},${g},${b},.2)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
});
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const SPR = {
  green: glow(70, 255, 140), yel: glow(255, 200, 50), red: glow(255, 50, 80), vio: glow(180, 100, 255), cyan: glow(60, 190, 255),
  fire: glow(255, 110, 20), white: glow(255, 255, 255), mag: glow(255, 40, 190), gold: glow(255, 190, 40),
  smoke: mk(64, 64, x => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(34,28,44,.9)'); g.addColorStop(.55, 'rgba(34,28,44,.45)'); g.addColorStop(1, 'rgba(34,28,44,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }),
};
const sprFor = col => SPR['c' + col] || (SPR['c' + col] = glow(...hexRgb(col)));
const SUN = mk(512, 512, x => {
  const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#ffe66d'); g.addColorStop(.5, '#ff8a3d'); g.addColorStop(1, '#ff2e88');
  x.fillStyle = g; x.beginPath(); x.arc(256, 256, 256, 0, 7); x.fill();
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9; i++) x.fillRect(0, 280 + i * 26, 512, 3 + i * 2.2);
});
const SCAN = ctx.createPattern(mk(1, 3, x => { x.fillStyle = 'rgba(0,0,0,.16)'; x.fillRect(0, 0, 1, 1); }), 'repeat');
const STARS = Array.from({ length: 260 }, () => ({ az: rand(-2, 2), el: rand(.03, 1), s: rand(.6, 1.8), p: rand(0, 7) }));
const SKYLINE = [];
for (let a = -1.9; a < 1.9;) {
  const w = rand(.02, .07);
  SKYLINE.push({ az: a, w, h: rand(.015, .07) * (Math.abs(a) < .3 ? .55 : 1), beacon: Math.random() < .4, lights: Array.from({ length: 5 + Math.random() * 10 | 0 }, () => [Math.random(), Math.random(), Math.random() < .3]) });
  a += w + rand(0, .015);
}
function spr(img, x, y, w, h, a) { ctx.globalAlpha = a; ctx.drawImage(img, x - w / 2, y - h / 2, w, h); }

// ───────────── camera / projection ─────────────
let W = 0, H = 0, DPR = 1, F = 1, VIG = null, maxDPR = 2;
const NEAR = .1, cam = { x: 0, y: 2.4, z: -4, yaw: 0, pitch: 0 };
let cY = 1, sY = 0, cP = 1, sP = 0;
function camUpdate() { cY = Math.cos(cam.yaw); sY = Math.sin(cam.yaw); cP = Math.cos(cam.pitch); sP = Math.sin(cam.pitch); }
function toCam(x, y, z) {
  const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z, rx = dx * cY - dz * sY, rz = dx * sY + dz * cY;
  return [rx, dy * cP - rz * sP, dy * sP + rz * cP];
}
function projC(c) { if (c[2] < NEAR - 1e-6) return null; const s = F / c[2]; return { x: W / 2 + c[0] * s, y: H / 2 - c[1] * s, s, z: c[2] }; }
const proj = (x, y, z) => projC(toCam(x, y, z));
function camDir(cx, cy, cz) { const dy = cP * cy + sP * cz, rz = -sP * cy + cP * cz; return [cY * cx + sY * rz, dy, -sY * cx + cY * rz]; }
function localToWorld(x, y, z) { const d = camDir(x, y, z); return [cam.x + d[0], cam.y + d[1], cam.z + d[2]]; }
function screenRay(sx, sy) { const d = camDir((sx - W / 2) / F, -(sy - H / 2) / F, 1), L = Math.hypot(...d); return [d[0] / L, d[1] / L, d[2] / L]; }
function seg3(ax, ay, az, bx, by, bz) {
  let A = toCam(ax, ay, az), B = toCam(bx, by, bz);
  if (A[2] < NEAR && B[2] < NEAR) return;
  if (A[2] < NEAR) { const t = (NEAR - A[2]) / (B[2] - A[2]); A = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, NEAR]; }
  if (B[2] < NEAR) { const t = (NEAR - B[2]) / (A[2] - B[2]); B = [B[0] + (A[0] - B[0]) * t, B[1] + (A[1] - B[1]) * t, NEAR]; }
  const p = projC(A), q = projC(B); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
}
function resize() {
  const r = cv.parentElement.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, maxDPR); W = Math.max(1, r.width); H = Math.max(1, r.height);
  cv.width = W * DPR | 0; cv.height = H * DPR | 0;
  F = Math.min(H * .5 / Math.tan(.5), W * .5 / Math.tan(.75));
  VIG = mk(W, H, x => {
    const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.72)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  });
}
new ResizeObserver(resize).observe(cv.parentElement); resize();

// ───────────── audio (all synthesized) ─────────────
let AC = null, master, sfxBus, musicBus, noiseBuf, nextNoteT = 0, stepI = 0, musicIntensity = 0;
const VOL = { sfx: .6, music: .3, muted: false };
function setVolumes() {
  if (!AC) return;
  sfxBus.gain.value = VOL.muted ? 0 : VOL.sfx; musicBus.gain.value = VOL.muted ? 0 : VOL.music * .5;
}
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(AC.destination);
  master = AC.createGain(); master.gain.value = 1; master.connect(comp);
  sfxBus = AC.createGain(); sfxBus.connect(master); musicBus = AC.createGain(); musicBus.connect(master);
  setVolumes();
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  nextNoteT = AC.currentTime + .1; setInterval(sched, 25);
}
function env(g, t, peak, dur) { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + dur); }
function tone(f, dur, { type = 'sine', vol = .3, to = 0, delay = 0, at = 0, out = sfxBus } = {}) {
  if (!AC) return; const t = at || AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  env(g, t, vol, dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .05);
}
function noise(dur, { vol = .3, f = 1000, to = 0, type = 'lowpass', q = 1, delay = 0, at = 0, out = sfxBus } = {}) {
  if (!AC) return; const t = at || AC.currentTime + delay, s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t); if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur); fl.Q.value = q;
  env(g, t, vol, dur); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + dur + .05);
}
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const PROG = [45, 41, 36, 43], CHORD = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
function sched() {
  if (nextNoteT < AC.currentTime) nextNoteT = AC.currentTime + .05;
  while (nextNoteT < AC.currentTime + .15) { if (!VOL.muted && VOL.music > 0) musicStep(stepI, nextNoteT); nextNoteT += 60 / 108 / 4; stepI = (stepI + 1) % 64; }
}
function musicStep(i, t) {
  const bar = i >> 4, s = i & 15, root = PROG[bar], out = musicBus;
  if (s % 2 === 0) {
    const o = AC.createOscillator(), fl = AC.createBiquadFilter(), g = AC.createGain();
    o.type = 'sawtooth'; o.frequency.value = mtof(root + (s % 4 === 2 ? 12 : 0));
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(700 + musicIntensity * 600, t); fl.frequency.exponentialRampToValueAtTime(140, t + .2);
    env(g, t, .22, .24); o.connect(fl); fl.connect(g); g.connect(out); o.start(t); o.stop(t + .3);
  }
  if (s % 4 === 0) tone(140, .22, { vol: .9, to: 38, at: t, out });
  if (s === 4 || s === 12) { noise(.16, { vol: .35, f: 1800, type: 'bandpass', at: t, out }); tone(190, .07, { type: 'triangle', vol: .18, at: t, out }); }
  if (s % 2 === 1) noise(.035, { vol: .1, f: 7000, type: 'highpass', at: t, out });
  tone(mtof(root + 24 + CHORD[bar][s % 3] + (s >= 8 ? 12 : 0)), .11, { type: 'square', vol: .025 + musicIntensity * .02, at: t, out });
  if (musicIntensity > .5 && s % 4 === 2) tone(mtof(root + 36 + CHORD[bar][(s >> 2) % 3]), .18, { type: 'sawtooth', vol: .03, at: t, out });
}
const sfx = {
  fire(w) {
    if (w === 0) { tone(220, .09, { type: 'square', vol: .05, to: 80 }); noise(.07, { vol: .13, f: 3000, to: 600, type: 'bandpass', q: .8 }); }
    else if (w === 1) { tone(160, .25, { vol: .35, to: 50 }); noise(.2, { vol: .25, f: 1500, to: 200 }); }
    else if (w === 2) { tone(90, .6, { vol: .7, to: 30 }); noise(.5, { vol: .5, f: 2000, to: 60 }); tone(55, .8, { type: 'sawtooth', vol: .12, to: 25 }); }
    else { tone(500, .3, { type: 'triangle', vol: .13, to: 1500 }); tone(750, .3, { vol: .08, to: 2200, delay: .05 }); }
  },
  agent() { tone(rand(700, 1100), .05, { type: 'triangle', vol: .015, to: 300 }); },
  hit() { noise(.05, { vol: .12, f: 4000, type: 'highpass' }); tone(660, .05, { type: 'square', vol: .03, to: 330 }); },
  crit() { tone(1800, .12, { type: 'square', vol: .06, to: 900 }); noise(.08, { vol: .2, f: 5000, type: 'highpass' }); },
  boom(k) { noise(.6 + k * .4, { vol: .45 + k * .1, f: 1600, to: 50 }); tone(80, .5 + k * .3, { vol: .5 + k * .1, to: 25 }); },
  coin() { tone(1319, .06, { type: 'square', vol: .035 }); tone(1760, .12, { type: 'square', vol: .035, delay: .05 }); },
  buy() { tone(660, .05, { type: 'triangle', vol: .12 }); tone(990, .09, { type: 'triangle', vol: .12, delay: .04 }); },
  deny() { tone(140, .12, { type: 'square', vol: .06 }); },
  pager() { [0, .16, .32].forEach((d, i) => tone(i % 2 ? 1319 : 988, .12, { type: 'square', vol: .05, delay: d })); },
  laser() { tone(2400, .12, { type: 'sawtooth', vol: .04, to: 400 }); },
  level() { [523, 659, 784].forEach((f, i) => tone(f, .14, { type: 'triangle', vol: .09, delay: i * .05 })); },
  clear() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .25, { type: 'triangle', vol: .15, delay: i * .08 })); },
  fail() { [392, 330, 262, 196].forEach((f, i) => tone(f, .35, { type: 'sawtooth', vol: .1, delay: i * .18 })); },
  golden() { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, .3, { type: 'sine', vol: .1, delay: i * .07 })); },
  goldSpawn() { [1568, 2093].forEach((f, i) => tone(f, .25, { type: 'sine', vol: .05, delay: i * .12 })); },
  ach() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, .22, { type: 'triangle', vol: .12, delay: i * .09 })); },
  pivot() { tone(80, 2.2, { type: 'sawtooth', vol: .2, to: 1600 }); noise(2, { vol: .3, f: 300, to: 8000, type: 'bandpass' }); [523, 784, 1047, 1568].forEach((f, i) => tone(f, .6, { type: 'triangle', vol: .12, delay: 1.6 + i * .1 })); },
  click() { tone(1200, .03, { type: 'square', vol: .04 }); },
  beat() { tone(60, .15, { vol: .5, to: 40 }); },
};

// ───────────── world containers & particles ─────────────
let servers = [], drones = [], projs = [], parts = [], texts = [], beams = [], alerts = [], later = [], golden = null;
let T = 0, recoil = 0, flash = 0, heat = 0, shake = 0, redFlash = 0, hitMark = 0, swayX = 0, swayY = 0, comboPop = 0;
let aimX = 0, aimY = 0, aimYaw = 0, aimPitch = .06, pYaw = 0, pPitch = 0, hoverCanvas = false, aimInfo = null;
const QUALITY = { particles: 1, shake: 1 };
function part(o) { if (parts.length > 2200 * QUALITY.particles || (QUALITY.particles < 1 && Math.random() > QUALITY.particles)) return; o.max = o.life; parts.push(o); }
function sparks(x, y, z, n, sp, col) { for (let i = 0; i < n; i++) part({ k: 'spark', x, y, z, vx: rand(-1, 1) * sp, vy: rand(-.3, 1.2) * sp, vz: rand(-1, 1) * sp, life: rand(.25, .6), col, g: 22, drag: 1.5 }); }
function glyphs(x, y, z, str, n, col, sp) { for (let i = 0; i < n; i++) part({ k: 'glyph', x, y, z, vx: rand(-1, 1) * sp, vy: rand(0, 1.4) * sp, vz: rand(-1, 1) * sp, life: rand(.5, 1.1), ch: str[Math.random() * str.length | 0], col, size: rand(.35, .7), g: 6, drag: 1.2 }); }
function say(x, y, z, str, col, size = .9, life = 1.2, big = 0) { texts.push({ x, y, z, str, col, size, life, max: life, big }); if (texts.length > 70) texts.shift(); }
function alert(sev, text) { alerts.unshift({ sev, text, t: 0 }); if (alerts.length > 4) alerts.length = 4; if (sev === 1) sfx.pager(); }
function explosion(x, y, z, big) {
  const k = big ? 1.8 : 1;
  part({ k: 'flash', x, y, z, life: .3 * k, size: 9 * k, spr: 'fire' });
  for (let i = 0; i < 22 * k; i++) part({ k: 'fire', x: x + rand(-1, 1) * k, y: y + rand(0, 2) * k, z: z + rand(-1, 1), vx: rand(-4, 4) * k, vy: rand(1, 7) * k, vz: rand(-4, 4) * k, life: rand(.4, 1.1), size: rand(1.5, 3.5) * k, g: -1, drag: 2 });
  sparks(x, y, z, 40 * k, 18 * k, '#ffcf6b');
  for (let i = 0; i < 14 * k; i++) part({ k: 'debris', x, y, z, vx: rand(-10, 10), vy: rand(5, 16), vz: rand(-10, 10), life: rand(1.5, 3), size: rand(.2, .6), g: 28, drag: .3, rot: rand(0, 6), vr: rand(-10, 10) });
  for (let i = 0; i < 10 * k; i++) part({ k: 'smoke', x: x + rand(-1.5, 1.5), y: y + rand(0, 2), z: z + rand(-1, 1), vx: rand(-1, 1), vy: rand(1, 3), vz: rand(-1, 1), life: rand(2, 4), size: rand(2, 4) * k, grow: 1.5, g: -.2, drag: .5 });
  part({ k: 'ring', x, y: .05, z, vx: 0, vy: 0, vz: 0, life: .7, size: 0, grow: 24 * k, g: 0, drag: 0 });
  glyphs(x, y, z, '500502503ERR!?#', 12 * k, '#ff6b6b', 9 * k);
}
function coins(x, y, z, n) { for (let i = 0; i < n; i++) part({ k: 'glyph', x, y, z, vx: rand(-3, 3), vy: rand(4, 10), vz: rand(-3, 3), life: rand(.8, 1.4), ch: '$', col: '#ffd23f', size: rand(.6, 1.1), g: 14, drag: .8 }); }
function updateParticles(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
    if (p.k === 'flash') continue;
    const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.grow) p.size += p.grow * dt;
    if (p.k === 'debris') { p.rot += p.vr * dt; if (p.y < .05) { p.y = .05; p.vy *= -.35; p.vx *= .6; p.vz *= .6; p.vr *= .6; } }
  }
  for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life -= dt; t.y += dt * (t.big ? .8 : 1.4); if (t.life <= 0) texts.splice(i, 1); }
  for (let i = beams.length - 1; i >= 0; i--) { beams[i].life -= dt; if (beams[i].life <= 0) beams.splice(i, 1); }
  for (let i = alerts.length - 1; i >= 0; i--) { alerts[i].t += dt; if (alerts[i].t > 7) alerts.splice(i, 1); }
}

// ───────────── raycast / collisions ─────────────
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity; const lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return -1; continue; }
    let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a]; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmax < tmin) return -1;
  }
  return tmin > 0 ? tmin : -1;
}
const sH = s => s.h * s.sp;
function raycast(o, d) {
  let best = 170, r = { s: null, dr: null, gold: null };
  for (const s of servers) {
    if (s.dead) continue;
    const t = rayBox(o, d, s.x - s.w / 2, 0, s.z - s.d / 2, s.x + s.w / 2, sH(s), s.z + s.d / 2);
    if (t > 0 && t < best) { best = t; r = { s, dr: null, gold: null }; }
  }
  const sph = (obj, rad, set) => {
    const ox = obj.x - o[0], oy = obj.y - o[1], oz = obj.z - o[2], tc = ox * d[0] + oy * d[1] + oz * d[2];
    if (tc > 0 && tc < best && ox * ox + oy * oy + oz * oz - tc * tc < rad * rad) { best = tc; r = set; }
  };
  for (const dr of drones) if (!dr.dead) sph(dr, 1.4, { s: null, dr, gold: null });
  if (golden) sph(golden, 2.6, { s: null, dr: null, gold: golden });
  if (d[1] < 0) { const tg = -o[1] / d[1]; if (tg < best) { best = tg; r = { s: null, dr: null, gold: null }; } }
  r.t = best; r.p = [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best];
  return r;
}
function collide(p) {
  if (golden && p.src !== 'agent' && (golden.x - p.x) ** 2 + (golden.y - p.y) ** 2 + (golden.z - p.z) ** 2 < 6.5) return { gold: golden };
  for (const s of servers) {
    if (s.dead) continue;
    if (Math.abs(p.x - s.x) < s.w / 2 && p.y < sH(s) && p.y > -.5 && Math.abs(p.z - s.z) < s.d / 2) return { s };
  }
  if (p.src !== 'agent') for (const d of drones) if (!d.dead && (d.x - p.x) ** 2 + (d.y - p.y) ** 2 + (d.z - p.z) ** 2 < 2) return { dr: d };
  if (p.y <= 0) return { ground: true };
  return null;
}
function nearestAlive(x, z) {
  let b = null, bd = Infinity;
  for (const s of servers) if (!s.dead && s.sp > .5) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; b = s; } }
  return b;
}
function nearestToRay(o, d) {
  let b = null, bd = -2;
  for (const s of servers) {
    if (s.dead) continue;
    const vx = s.x - o[0], vy = s.h / 2 - o[1], vz = s.z - o[2], L = Math.hypot(vx, vy, vz), dot = (vx * d[0] + vy * d[1] + vz * d[2]) / L;
    if (dot > bd) { bd = dot; b = s; }
  }
  return b;
}

// ───────────── drawing: world ─────────────
const FOG = [62, 14, 82];
const fogF = d => clamp((d - 25) / 130, 0, .78);
function shade(c, k, f) { return `rgb(${(Math.min(255, c[0] * k) * (1 - f) + FOG[0] * f) | 0},${(Math.min(255, c[1] * k) * (1 - f) + FOG[1] * f) | 0},${(Math.min(255, c[2] * k) * (1 - f) + FOG[2] * f) | 0})`; }
function quad(a, b, c, d, fill) {
  if (!a || !b || !c || !d) return;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function drawSky(boss) {
  const hy = H / 2 + F * Math.tan(cam.pitch);
  const g = ctx.createLinearGradient(0, hy - F * 1.1, 0, hy);
  if (boss) { g.addColorStop(0, '#0c0105'); g.addColorStop(.5, '#2a0512'); g.addColorStop(.82, '#5a0d2a'); g.addColorStop(1, '#a3203a'); }
  else { g.addColorStop(0, '#04010c'); g.addColorStop(.5, '#16052e'); g.addColorStop(.82, '#3f0d58'); g.addColorStop(1, '#8b1d6e'); }
  ctx.fillStyle = g; ctx.fillRect(-60, -60, W + 120, hy + 60);
  ctx.fillStyle = '#fff';
  for (const s of STARS) {
    const dx = s.az - cam.yaw; if (Math.abs(dx) > 1.25) continue;
    const y = H / 2 - F * Math.tan(s.el - cam.pitch); if (y > hy) continue;
    ctx.globalAlpha = (.35 + .65 * Math.abs(Math.sin(T * .8 + s.p))) * clamp((hy - y) / 200, .1, 1);
    ctx.fillRect(W / 2 + F * Math.tan(dx), y, s.s, s.s);
  }
  const sx = W / 2 + F * Math.tan(-cam.yaw), sy = H / 2 - F * Math.tan(.1 - cam.pitch), r = F * .24;
  ctx.globalCompositeOperation = 'lighter'; spr(boss ? SPR.red : SPR.mag, sx, sy, r * 5, r * 4, .55); ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1; ctx.drawImage(SUN, sx - r, sy - r, r * 2, r * 2);
  for (const b of SKYLINE) {
    const d0 = b.az - cam.yaw, d1 = d0 + b.w; if (d1 < -1.3 || d0 > 1.3) continue;
    const x0 = W / 2 + F * Math.tan(d0), x1 = W / 2 + F * Math.tan(d1), top = hy - F * b.h;
    ctx.globalAlpha = 1; ctx.fillStyle = '#0c0419'; ctx.fillRect(x0, top, x1 - x0 + 1, hy - top + 1);
    ctx.fillStyle = 'rgba(255,80,200,.35)'; ctx.fillRect(x0, top, x1 - x0, 1);
    for (const l of b.lights) { ctx.fillStyle = l[2] ? '#6fe3ff' : '#ffb347'; ctx.globalAlpha = .55; ctx.fillRect(x0 + l[0] * (x1 - x0 - 2), top + 3 + l[1] * (hy - top - 6), 1.5, 1.5); }
    if (b.beacon && Math.sin(T * 3 + b.az * 9) > .3) { ctx.globalAlpha = 1; ctx.fillStyle = '#ff3355'; ctx.fillRect((x0 + x1) / 2 - 1, top - 3, 2, 2); }
  }
  ctx.globalAlpha = 1;
  return hy;
}
function drawGround(hy) {
  const g = ctx.createLinearGradient(0, hy, 0, H);
  g.addColorStop(0, '#1d0833'); g.addColorStop(1, '#06020d');
  ctx.fillStyle = g; ctx.fillRect(-60, hy, W + 120, H - hy + 60);
  ctx.beginPath();
  for (let x = -150; x <= 150; x += 6) seg3(x, 0, -10, x, 0, 240);
  for (let z = 0; z <= 240; z += 6) seg3(-160, 0, z, 160, 0, z);
  ctx.strokeStyle = 'rgba(255,60,200,.5)'; ctx.lineWidth = 1.2; ctx.stroke();
  const pz = (T * 30) % 240; ctx.beginPath(); seg3(-160, 0, pz, 160, 0, pz); ctx.strokeStyle = 'rgba(111,227,255,.7)'; ctx.lineWidth = 2; ctx.stroke();
  const fg = ctx.createLinearGradient(0, hy, 0, hy + H * .2);
  fg.addColorStop(0, 'rgba(70,16,92,1)'); fg.addColorStop(1, 'rgba(70,16,92,0)');
  ctx.fillStyle = fg; ctx.fillRect(-60, hy, W + 120, H * .2);
  ctx.fillStyle = 'rgba(255,120,220,.85)'; ctx.fillRect(-60, hy - 1, W + 120, 2);
  for (const s of servers) {
    const p = proj(s.x, 0, s.z); if (!p) continue;
    const w = s.w * 2.6 * p.s, h = w * clamp(cam.y / p.z * 1.6, .06, .5);
    if (s.dead) { ctx.globalAlpha = .75; ctx.fillStyle = '#050208'; ctx.beginPath(); ctx.ellipse(p.x, p.y, w * .5, h * .5, 0, 0, 7); ctx.fill(); }
    else { ctx.globalCompositeOperation = 'lighter'; spr(s.treasure ? SPR.gold : SPR[s.type === 'db' || s.type === 'boss' ? 'mag' : s.type === 'pod' ? 'green' : s.type === 'lb' ? 'yel' : 'cyan'], p.x, p.y, w, h, .45 * (1 - fogF(p.z)) * s.sp); ctx.globalCompositeOperation = 'source-over'; }
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const p of parts) {
    if (p.k !== 'ring') continue;
    ctx.beginPath(); let first = true;
    for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI * 2, q = proj(p.x + Math.cos(a) * p.size, .05, p.z + Math.sin(a) * p.size); if (!q) { first = true; continue; } first ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y); first = false; }
    ctx.globalAlpha = p.life / p.max; ctx.strokeStyle = p.col || '#ff9a4d'; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function drawServer(s, dist) {
  const f = fogF(dist), x = s.x + (s.dead ? 0 : Math.sin(T * 90) * s.hitT * .12), h = s.dead ? s.h * .32 : s.h * s.sp;
  if (h < .02) return;
  const x0 = x - s.w / 2, x1 = x + s.w / 2, z0 = s.z - s.d / 2, z1 = s.z + s.d / 2;
  const body = s.dead ? [16, 10, 14] : s.body;
  const p = [proj(x0, 0, z0), proj(x1, 0, z0), proj(x1, h, z0), proj(x0, h, z0), proj(x0, 0, z1), proj(x1, 0, z1), proj(x1, h, z1), proj(x0, h, z1)];
  if (cam.x < x0) quad(p[4], p[0], p[3], p[7], shade(body, .6, f));
  if (cam.x > x1) quad(p[1], p[5], p[6], p[2], shade(body, .6, f));
  if (cam.y > h) quad(p[3], p[2], p[6], p[7], shade(body, 1.7, f));
  quad(p[0], p[1], p[2], p[3], shade(body, 1, f));
  if (s.dead || !p[0] || !p[1] || !p[2] || !p[3]) return;
  const sc = p[0].s, a = 1 - f, zf = z0 - .02, r = s.hp / s.maxHp;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = .45 * a; ctx.strokeStyle = s.accS; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[3].x, p[3].y); ctx.lineTo(p[2].x, p[2].y); ctx.lineTo(p[1].x, p[1].y);
  if (p[7] && p[6] && cam.y > h) { ctx.moveTo(p[3].x, p[3].y); ctx.lineTo(p[7].x, p[7].y); ctx.lineTo(p[6].x, p[6].y); ctx.lineTo(p[2].x, p[2].y); }
  ctx.stroke();
  const sa = proj(x0 + .16, .15, zf), sb = proj(x0 + .16, h - .15, zf);
  if (sa && sb) { ctx.globalAlpha = .9 * a; ctx.lineWidth = Math.max(1, .08 * sc); ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke(); }
  if (sc > 7) {
    const rows = Math.floor((h - .3) / .42);
    ctx.globalAlpha = .1 * a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 1; i <= rows; i++) { const y = .15 + i * .42, q1 = proj(x0 + .3, y, zf), q2 = proj(x1 - .1, y, zf); if (q1 && q2) { ctx.moveTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); } }
    ctx.stroke();
    ctx.fillStyle = r > .6 ? '#4dff88' : r > .3 ? '#ffb020' : '#ff3050'; ctx.globalAlpha = a;
    const sz = Math.max(1.3, .09 * sc), fast = r < .3 ? 4 : 1;
    for (let i = 0; i < rows; i++) for (let j = 0; j < 3; j++) {
      if (Math.sin(T * (3 + (s.id * 7 + i * 3 + j) % 5) * fast + i * 1.7 + j) < .1) continue;
      const q = proj(x1 - .25 - j * .2, .36 + i * .42, zf); if (q) ctx.fillRect(q.x - sz / 2, q.y - sz / 2, sz, sz);
    }
    if (s.type === 'boss' && s.sp > .95) {
      const q1 = proj(x - 2.6, h * .62, zf), q2 = proj(x + 2.6, h * .52, zf);
      if (q1 && q2) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a; ctx.fillStyle = '#ffd23f'; ctx.fillRect(q1.x, q1.y, q2.x - q1.x, q2.y - q1.y); ctx.fillStyle = '#111'; ctx.font = `800 ${(q2.y - q1.y) * .6}px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText('DO NOT TOUCH', (q1.x + q2.x) / 2, (q1.y + q2.y) / 2 + 1); ctx.globalCompositeOperation = 'lighter'; }
    }
  }
  if (s.treasure) { const q = proj(x, h + .4, s.z); if (q) spr(SPR.gold, q.x, q.y, sc * 3, sc * 2, .5 + .2 * Math.sin(T * 6)); }
  if (s.hitT > 0) { ctx.globalAlpha = s.hitT * .5; quad(p[0], p[1], p[2], p[3], '#fff'); }
  if (s.sp < 1) { ctx.globalAlpha = (1 - s.sp) * .9; quad(p[0], p[1], p[2], p[3], '#6fe3ff'); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function drawDrone(d) {
  const p = proj(d.x, d.y, d.z); if (!p) return;
  const r = .55 * p.s;
  ctx.strokeStyle = '#333a55'; ctx.lineWidth = Math.max(1, .12 * p.s);
  ctx.beginPath(); ctx.moveTo(p.x - r * 2, p.y); ctx.lineTo(p.x + r * 2, p.y); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  for (const sx of [-1, 1]) { ctx.globalAlpha = .35; ctx.fillStyle = '#9fdcff'; ctx.beginPath(); ctx.ellipse(p.x + sx * r * 2, p.y - r * .3, r * (.9 + .2 * Math.sin(T * 60 + sx)), r * .18, 0, 0, 7); ctx.fill(); }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = d.hitT > 0 ? '#fff' : '#141826'; ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * .7, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#6fe3ff'; ctx.lineWidth = Math.max(1, .06 * p.s); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter'; spr(SPR.cyan, p.x, p.y + r * .1, r * 2.2, r * 2.2, .7 + .3 * Math.sin(T * 8 + d.ph));
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.font = `700 ${clamp(p.s * .32, 9, 13)}px ${MONO}`; ctx.textAlign = 'center'; ctx.fillStyle = '#7fd8ff';
  ctx.fillText(`${d.name} ${'■'.repeat(d.hp)}${'□'.repeat(3 - d.hp)}`, p.x, p.y - r * 1.6);
}
function drawGolden() {
  const g = golden, p = proj(g.x, g.y, g.z); if (!p) return;
  const r = 1.1 * p.s, a = Math.min(1, g.life / 1.5, g.age / .4);
  ctx.globalCompositeOperation = 'lighter';
  spr(SPR.gold, p.x, p.y, r * 7 * (1 + .1 * Math.sin(T * 8)), r * 7 * (1 + .1 * Math.sin(T * 8)), .8 * a);
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.sin(T * 2) * .25);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
  const gr = ctx.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(.5, '#ffc93c'); gr.addColorStop(1, '#b8740d');
  ctx.fillStyle = gr; ctx.fillRect(-r, -r * .8, r * 2, r * 1.6);
  ctx.fillStyle = 'rgba(80,40,0,.6)'; ctx.fillRect(-r * .12, -r * .8, r * .24, r * 1.6); ctx.fillRect(-r, -r * .1, r * 2, r * .2);
  ctx.restore();
  ctx.globalAlpha = a; ctx.font = `800 ${clamp(p.s * .45, 11, 18)}px ${MONO}`; ctx.textAlign = 'center';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText('!! 0-DAY · SHOOT IT !!', p.x, p.y - r * 2.2); ctx.fillStyle = '#ffd23f'; ctx.fillText('!! 0-DAY · SHOOT IT !!', p.x, p.y - r * 2.2);
  ctx.globalAlpha = 1;
}
function drawWorld() {
  const L = [];
  for (const s of servers) { const c = toCam(s.x, s.h * .5, s.z); if (c[2] > NEAR) L.push({ d: c[2], k: 0, o: s }); }
  for (const d of drones) if (!d.dead) { const c = toCam(d.x, d.y, d.z); if (c[2] > NEAR) L.push({ d: c[2], k: 2, o: d }); }
  if (golden) { const c = toCam(golden.x, golden.y, golden.z); if (c[2] > NEAR) L.push({ d: c[2], k: 4, o: golden }); }
  for (const p of parts) if (p.k === 'smoke' || p.k === 'debris') { const c = toCam(p.x, p.y, p.z); if (c[2] > NEAR) L.push({ d: c[2], k: 3, o: p, c }); }
  L.sort((a, b) => b.d - a.d);
  for (const it of L) {
    if (it.k === 0) drawServer(it.o, it.d);
    else if (it.k === 2) drawDrone(it.o);
    else if (it.k === 4) drawGolden();
    else {
      const p = it.o, q = projC(it.c), a = p.life / p.max;
      if (p.k === 'smoke') { const sz = p.size * q.s; spr(SPR.smoke, q.x, q.y, sz, sz, Math.min(1, a * 1.5) * .7); }
      else { const sz = Math.max(1.5, p.size * q.s); ctx.globalAlpha = 1; ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(p.rot); ctx.fillStyle = '#2a2233'; ctx.fillRect(-sz / 2, -sz / 2, sz, sz); ctx.fillStyle = 'rgba(255,140,60,.5)'; ctx.fillRect(-sz / 2, -sz / 2, sz, sz * .25); ctx.restore(); }
    }
  }
  ctx.globalAlpha = 1;
}
function drawAdditive() {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of parts) {
    if (p.k === 'smoke' || p.k === 'debris' || p.k === 'ring') continue;
    const q = proj(p.x, p.y, p.z); if (!q) continue;
    const a = p.life / p.max;
    if (p.k === 'spark') {
      const q2 = proj(p.x - p.vx * .035, p.y - p.vy * .035, p.z - p.vz * .035); if (!q2) continue;
      ctx.globalAlpha = a; ctx.strokeStyle = p.col; ctx.lineWidth = Math.max(1, .05 * q.s); ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q2.x, q2.y); ctx.stroke();
    } else if (p.k === 'fire') { const sz = p.size * q.s * (.5 + a * .7); spr(SPR.fire, q.x, q.y, sz, sz, a); }
    else if (p.k === 'flash') { const sz = Math.min(p.size * q.s, F * 2); spr(SPR[p.spr] || sprFor(p.spr), q.x, q.y, sz, sz, a); }
    else if (p.k === 'glyph') { ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.font = `700 ${clamp(p.size * q.s, 6, 24) | 0}px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText(p.ch, q.x, q.y); }
  }
  for (const b of beams) {
    const p = proj(...b.a), q = proj(...b.b); if (!p || !q) continue;
    const a = b.life / b.max;
    for (const [w, al] of [[8, .25], [2.5, 1]]) { ctx.globalAlpha = a * al; ctx.strokeStyle = `rgb(${b.col})`; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
  }
  for (const p of projs) {
    const q = proj(p.x, p.y, p.z); if (!q) continue;
    const gs = Math.min(1.6 * p.size * q.s * 2, 160), img = SPR[p.spr] || sprFor(p.col);
    spr(img, q.x, q.y, gs * 1.6, gs, .9);
    const fs = clamp(p.size * q.s, 7, p.src === 'agent' ? 22 : 40) | 0;
    ctx.font = `800 ${fs}px ${MONO}`; ctx.textAlign = 'center';
    ctx.globalAlpha = 1; ctx.fillStyle = p.col; ctx.fillText(p.text, q.x, q.y);
    ctx.globalAlpha = .45; ctx.fillStyle = '#fff'; ctx.fillText(p.text, q.x, q.y);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function drawLabels() {
  ctx.textAlign = 'center';
  for (const s of servers) {
    if ((s.dead && s.deadT > 2.5) || s.sp < .6) continue;
    const p = proj(s.x, (s.dead ? s.h * .32 : s.h) + .9, s.z); if (!p) continue;
    const boss = s.type === 'boss', fs = clamp(p.s * .42, 9, boss ? 20 : 14), a = s.dead ? 1 - s.deadT / 2.5 : 1 - fogF(p.z) * .6;
    ctx.globalAlpha = a; ctx.font = `700 ${fs}px ${MONO}`;
    ctx.fillStyle = s.dead ? '#ff3355' : s.treasure ? '#ffd23f' : '#e8e6ff'; ctx.fillText(s.dead ? `${s.name} · DOWN` : s.name, p.x, p.y);
    if (s.dead) continue;
    const bw = clamp(p.s * 2.4, 36, boss ? 240 : 100), r = clamp(s.hp / s.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(p.x - bw / 2 - 1, p.y + fs * .55, bw + 2, boss ? 8 : 6);
    ctx.fillStyle = r > .6 ? '#4dff88' : r > .3 ? '#ffb020' : '#ff3050'; ctx.fillRect(p.x - bw / 2, p.y + fs * .55 + 1, bw * r, boss ? 6 : 4);
    if (boss) { ctx.font = `700 11px ${MONO}`; ctx.fillStyle = '#e8e6ff'; ctx.fillText(`${fmt(Math.max(0, s.hp))} / ${fmt(s.maxHp)} HP`, p.x, p.y + fs * .55 + 20); }
  }
  for (const t of texts) {
    const p = proj(t.x, t.y, t.z); if (!p) continue;
    const a = clamp(t.life / t.max * 2, 0, 1), pop = 1 + Math.max(0, (t.life - t.max + .15) / .15) * (t.big ? .9 : .5);
    const fs = clamp(t.size * p.s * .55, t.big ? 18 : 11, t.big ? 46 : 32) * pop;
    ctx.globalAlpha = a; ctx.font = `800 ${fs}px ${t.big ? DISP : MONO}`; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.strokeText(t.str, p.x, p.y); ctx.fillStyle = t.col; ctx.fillText(t.str, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

// ───────────── drawing: cannon viewmodel ─────────────
// The barrel pivots at its breech and points its muzzle at the 3D point under the crosshair.
// Everything is in camera-local space (x right, y up, z forward).
const B_BASE = [0, -.86, .8], B_LEN = 2.116;
let bDir = [0, .1229, .9924];
const norm3 = v => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };
function updateBarrel(dt) {
  const t = hoverCanvas && aimInfo ? toCam(...aimInfo.p) : [0, -.4, 60];
  const d = norm3([t[0] - B_BASE[0], t[1] - B_BASE[1], t[2] - B_BASE[2]]), k = Math.min(1, dt * 16);
  bDir = norm3(bDir.map((v, i) => lerp(v, d[i], k)));
}
const cannonOff = () => [swayX + Math.sin(T * 1.6) * .006, swayY - recoil * .04 + Math.cos(T * 3.2) * .004, -recoil * .3];
function barrelAt(u) {
  const [ox, oy] = cannonOff(), l = B_LEN * u - recoil * .3;
  return [B_BASE[0] + ox + bDir[0] * l, B_BASE[1] + oy + bDir[1] * l, B_BASE[2] + bDir[2] * l];
}
function muzzleWorld() { return localToWorld(...barrelAt(1)); }
function drawCannon(info) {
  const [ox, oy, oz] = cannonOff(), N = 18, sec = [];
  const up = norm3([-bDir[0] * bDir[1], 1 - bDir[1] * bDir[1], -bDir[2] * bDir[1]]); // world-up, made perpendicular to the barrel
  const scr = (P, s) => ({ x: W / 2 + P[0] * s, y: H / 2 - P[1] * s });
  for (let i = 0; i <= N; i++) {
    const u = i / N; let r = lerp(.42, .215, u), band = false;
    if (u > .86) { r *= 1.24; band = i === N - 2 || i === N; }
    else if (Math.abs(u - .33) < .03 || Math.abs(u - .6) < .03) { r *= 1.07; band = true; }
    const P = barrelAt(u), s = F / P[2], c = scr(P, s);
    const rs = lerp(.42, .215, u) * .97, tp = [P[0] + up[0] * rs, P[1] + up[1] * rs, P[2] + up[2] * rs], ts = scr(tp, F / tp[2]); // top seam (ignores ring bulges) for the conduit
    sec.push({ x: c.x, y: c.y, r: r * s, u, band, tx: ts.x, ty: ts.y });
  }
  // silhouette normal per section (perpendicular to the barrel's on-screen axis)
  for (let i = 0; i <= N; i++) {
    const a = sec[Math.max(0, i - 1)], b = sec[Math.min(N, i + 1)], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    sec[i].nx = -(b.y - a.y) / L; sec[i].ny = (b.x - a.x) / L;
  }
  const metal = (c, k) => {
    const g = ctx.createLinearGradient(c.x - c.nx * c.r, c.y - c.ny * c.r, c.x + c.nx * c.r, c.y + c.ny * c.r);
    g.addColorStop(0, '#07080c'); g.addColorStop(.22, k ? '#2a2f3d' : '#333a4c'); g.addColorStop(.38, k ? '#7d88a5' : '#9aa6c4');
    g.addColorStop(.5, '#3d4558'); g.addColorStop(.78, '#1a1e28'); g.addColorStop(1, '#050608'); return g;
  };
  const circ = (c, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 7); ctx.fill(); };
  circ(sec[N], metal(sec[N], 1));
  for (let i = N - 1; i >= 0; i--) {
    const a = sec[i], b = sec[i + 1], g = metal(a, a.band);
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(b.x - b.nx * b.r, b.y - b.ny * b.r); ctx.lineTo(a.x - a.nx * a.r, a.y - a.ny * a.r);
    ctx.lineTo(a.x + a.nx * a.r, a.y + a.ny * a.r); ctx.lineTo(b.x + b.nx * b.r, b.y + b.ny * b.r); ctx.closePath(); ctx.fill();
    circ(a, g);
    if (a.band) { ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = Math.max(1, a.r * .03); ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 7); ctx.stroke(); }
  }
  ctx.globalCompositeOperation = 'lighter';
  const wc = info.col;
  for (const [lw, al] of [[.08, .25], [.025, 1]]) {
    ctx.strokeStyle = wc; ctx.globalAlpha = al * (.7 + .3 * Math.sin(T * 4)); ctx.lineWidth = Math.max(1, sec[8].r * lw * 1.3); ctx.lineCap = 'round';
    ctx.beginPath(); for (let i = 1; i < N - 3; i++) ctx.lineTo(sec[i].tx, sec[i].ty); ctx.stroke();
  }
  const mb = sec[N - 1], va = Math.atan2(mb.ty - mb.y, mb.tx - mb.x); ctx.globalAlpha = .9; ctx.lineWidth = Math.max(1.5, mb.r * .12); ctx.setLineDash([mb.r * .18, mb.r * .14]);
  ctx.beginPath(); ctx.arc(mb.x, mb.y, mb.r * .88, va - Math.PI * .35, va + Math.PI * .35); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';
  if (heat > .05) for (let i = N - 6; i <= N; i += 2) spr(SPR.fire, lerp(sec[i].x, sec[i].tx, .3), lerp(sec[i].y, sec[i].ty, .3), sec[i].r * 2.6, sec[i].r * 2.2, heat * .45);
  if (flash > 0) {
    const tip = sec[N], fs = F / (3.3 + oz), fx = tip.x, fy = tip.y;
    spr(SPR[info.spr], fx, fy, fs * 2.4 * flash, fs * 2.4 * flash, flash);
    spr(SPR.white, fx, fy, fs * 1.0 * flash, fs * 1.0 * flash, flash);
    ctx.strokeStyle = wc; ctx.lineWidth = 2; ctx.globalAlpha = flash;
    ctx.beginPath(); for (let i = 0; i < 7; i++) { const a = rand(0, 7), l = rand(.4, 1.1) * fs * flash; ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.cos(a) * l, fy + Math.sin(a) * l); } ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // monitors are bolted to the barrel: follow its swing at their mounting depth
  const mount = barrelAt(.28), mx = mount[0] - B_BASE[0], my = mount[1] - B_BASE[1] - .0728;
  monitor(-.78, -.3, -.44, -.5, 1.4, mx, my, oz, (x, y, w, h, fs) => {
    ctx.fillStyle = info.col; ctx.font = `800 ${fs * 1.15}px ${MONO}`; ctx.fillText(info.name, x, y + fs * 1.2);
    ctx.fillStyle = 'rgba(232,230,255,.65)'; ctx.font = `400 ${fs * .8}px ${MONO}`; ctx.fillText('SHOT ' + fmt(info.shot) + '  ·  ' + info.sub, x, y + fs * 2.4);
    ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(x, y + fs * 3, w - fs, fs * .5); ctx.fillStyle = info.cool >= 1 ? info.col : '#ff4d6d'; ctx.fillRect(x, y + fs * 3, (w - fs) * info.cool, fs * .5);
    ctx.fillStyle = 'rgba(93,255,155,.45)'; ctx.font = `400 ${fs * .72}px ${MONO}`;
    const off = (T * 3) % 1, base = T * 3 | 0;
    for (let i = 0; i < 4; i++) ctx.fillText('> ' + SLOP[(base + i) % SLOP.length], x, y + fs * (4.6 + i * 1.05 - off * 1.05));
  });
  monitor(.44, -.3, .78, -.5, 1.4, mx, my, oz, (x, y, w, h, fs) => {
    ctx.font = `800 ${fs}px ${MONO}`; ctx.fillStyle = 'rgba(232,230,255,.75)'; ctx.fillText('INCIDENT #' + info.level, x, y + fs * 1.2);
    ctx.fillStyle = Math.sin(T * 6) > 0 ? '#ff4d6d' : '#7a2433'; ctx.fillText('BUILD: FAILING (x)', x, y + fs * 2.4);
    ctx.font = `400 ${fs * .8}px ${MONO}`; ctx.fillStyle = 'rgba(232,230,255,.65)';
    ctx.fillText('AGENT DPS ' + fmt(info.dps), x, y + fs * 3.5); ctx.fillText('AGENTS ' + info.agents + ' · COV 3%', x, y + fs * 4.5);
    ctx.fillText('HEAT', x, y + fs * 5.6);
    ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(x + fs * 2.6, y + fs * 5.3, w - fs * 3.6, fs * .5);
    ctx.fillStyle = heat > .7 ? '#ff4d6d' : '#ffb020'; ctx.fillRect(x + fs * 2.6, y + fs * 5.3, (w - fs * 3.6) * heat, fs * .5);
  });
}
function monitor(lx0, ly0, lx1, ly1, lz, ox, oy, oz, content) {
  const s = F / (lz + oz), x0 = W / 2 + (lx0 + ox) * s, x1 = W / 2 + (lx1 + ox) * s, y0 = H / 2 - (ly0 + oy) * s, y1 = H / 2 - (ly1 + oy) * s;
  const w = x1 - x0, h = y1 - y0, bz = Math.max(3, w * .03);
  const arm = lx0 < 0 ? x1 : x0, armTo = W / 2 + ox * s + (lx0 < 0 ? -.3 : .3) * s;
  ctx.strokeStyle = '#1a1e28'; ctx.lineWidth = Math.max(4, h * .12); ctx.beginPath(); ctx.moveTo(arm, y1 - h * .2); ctx.lineTo(armTo, y1 + h * .25); ctx.stroke();
  ctx.fillStyle = '#12141c'; ctx.fillRect(x0 - bz, y0 - bz, w + bz * 2, h + bz * 2);
  ctx.fillStyle = '#04110a'; ctx.fillRect(x0, y0, w, h);
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
  ctx.textAlign = 'left'; content(x0 + h * .08, y0, w, h, h / 8);
  ctx.fillStyle = SCAN; ctx.fillRect(x0, y0, w, h);
  ctx.globalCompositeOperation = 'lighter'; spr(SPR.green, x0 + w / 2, y0 + h / 2, w * 1.2, h * 1.2, .12); ctx.globalCompositeOperation = 'source-over';
  ctx.restore(); ctx.globalAlpha = 1;
}

// ───────────── drawing: canvas HUD ─────────────
function txt(s, x, y, size, col, align = 'left', font = MONO, weight = 700) { ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.fillStyle = col; ctx.fillText(s, x, y); }
const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
function drawCrosshair(col) {
  const cx = aimX, cy = aimY, g = 7 + recoil * 12, l = 9;
  const onTarget = aimInfo && (aimInfo.s || aimInfo.dr || aimInfo.gold);
  const c = aimInfo && aimInfo.gold ? '#ffd23f' : onTarget ? '#ff4d6d' : col;
  ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 4; ctx.beginPath();
  ctx.moveTo(cx - g - l, cy); ctx.lineTo(cx - g, cy); ctx.moveTo(cx + g, cy); ctx.lineTo(cx + g + l, cy); ctx.moveTo(cx, cy - g - l); ctx.lineTo(cx, cy - g); ctx.moveTo(cx, cy + g); ctx.lineTo(cx, cy + g + l);
  ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = c; ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
  if (hitMark > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${hitMark * 5})`; ctx.lineWidth = 2; ctx.beginPath();
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(cx + dx * 6, cy + dy * 6); ctx.lineTo(cx + dx * 14, cy + dy * 14); }
    ctx.stroke();
  }
  if (onTarget && aimInfo.s) txt(`${aimInfo.s.name} · ${Math.ceil(Math.max(0, aimInfo.s.hp) / aimInfo.s.maxHp * 100)}%`, cx, cy + 34, 12, c, 'center');
}
function drawAlerts(top) {
  const aw = Math.min(360, W * .42), ax = W - 14 - aw;
  alerts.forEach((a, i) => {
    const slide = (1 - Math.min(1, a.t * 5)) ** 2 * 420, al = a.t > 6 ? 7 - a.t : 1, y = top + i * 40;
    ctx.globalAlpha = al; const c = a.sev === 1 ? '#ff3355' : a.sev === 2 ? '#ff8a3d' : a.sev === 0 ? '#ffd23f' : '#7fd8ff';
    ctx.fillStyle = 'rgba(10,4,24,.72)'; ctx.fillRect(ax + slide, y, aw, 34); ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.strokeRect(ax + slide + .5, y + .5, aw - 1, 33);
    ctx.fillStyle = c; ctx.fillRect(ax + slide + 8, y + 8, 50, 18); txt(a.sev === 0 ? 'LOOT' : `SEV-${a.sev}`, ax + slide + 33, y + 17, 10, '#12040c', 'center', MONO, 800);
    txt(trunc(a.text, Math.floor((aw - 80) / 7)), ax + slide + 66, y + 17, 11, '#e8e6ff', 'left', MONO, 400);
    ctx.globalAlpha = 1;
  });
}

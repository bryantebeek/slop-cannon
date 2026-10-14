// SLOP CANNON: IDLE OPS — game state, combat, progression systems and UI.
'use strict';
const E = ECON, SAVE_KEY = 'slopcannon.idle.v1';
const $ = (s, r = document) => r.querySelector(s);
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const k in props || {}) {
    const v = props[k];
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'tip') el._tip = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(c));
  return el;
}
function setText(el, s) { if (el._t !== s) { el._t = s; el.textContent = s; } }
function setHTML(el, s) { if (el._h !== s) { el._h = s; el.innerHTML = s; } }
const plural = (n, w) => `${fmt(n)} ${w}${n === 1 ? '' : 's'}`;
const fmtTime = s => { s = Math.floor(s); const d = s / 86400 | 0, hh = s % 86400 / 3600 | 0, m = s % 3600 / 60 | 0, ss = s % 60; return d ? `${d}d ${hh}h` : hh ? `${hh}h ${m}m` : m ? `${m}m ${ss}s` : `${ss}s`; };

// ───────────── save / load ─────────────
function merge(base, saved) {
  for (const k in saved) {
    if (saved[k] && typeof saved[k] === 'object' && !Array.isArray(saved[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], saved[k]);
    else base[k] = saved[k];
  }
  return base;
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY); if (!raw) return null;
    const S = merge(E.fresh(), JSON.parse(raw));
    while (S.agents.length < E.AGENTS.length) S.agents.push(0);
    return S;
  } catch (e) { console.warn('save corrupt', e); return null; }
}
let S = load(); const hadSave = !!S; if (!S) S = E.fresh();
function save() { S.saved = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { } }
const encodeSave = () => btoa(unescape(encodeURIComponent(JSON.stringify(S))));
const decodeSave = s => merge(E.fresh(), JSON.parse(decodeURIComponent(escape(atob(s.trim())))));

// ───────────── derived stats, buffs ─────────────
let D = E.derive(S), dirty = true, structDirty = true;
function markDirty(struct) { dirty = true; if (struct) structDirty = true; }
function refresh() { if (dirty) { D = E.derive(S); dirty = false; } }
let buffs = [];
const dpsBuff = () => buffs.reduce((m, b) => m * (b.dps || 1), 1);
const shotBuff = () => buffs.reduce((m, b) => m * (b.click || 1), 1);
const G = { combo: 0, comboT: 0, bestCombo: 0, idleT: 0, idleKills: 0, konami: false, tickerClick: false, dropBoss: false, closeCall: false, muted: false, bossFail: false };

function applySettings() {
  VOL.sfx = S.settings.sfx; VOL.music = S.settings.music; setVolumes();
  NOTATION = S.settings.notation; QUALITY.particles = S.settings.particles; QUALITY.shake = S.settings.shake;
}
applySettings();

// ───────────── economy actions ─────────────
function earn(x) { if (!(x > 0)) return; S.cash += x; S.runEarned += x; S.eraEarned += x; S.totalEarned += x; }
function idleDps() { return D.dps * dpsBuff() + D.cron * .5 * E.shotDamage(D, dpsBuff()); }
function incomePerSec() {
  const l = E.isBoss(S.level) ? Math.max(1, S.level - 1) : S.level, e = idleDps();
  if (e <= 0) return 0;
  const per = Math.max(E.hp(l) / e, .12) + .15;
  return E.PER_LEVEL * E.reward(l) * D.gold / (per * E.PER_LEVEL + 1.5);
}
const agentLocked = i => S.challenge === 'legacy4' && i >= 4;
const agentVisible = i => i === 0 || S.agents[i - 1] > 0 || S.agents[i] > 0;
let buyMode = 1; // 1, 10, 25, 100 or 'max'
function buyCount(i) { if (buyMode === 'max') return Math.max(1, E.maxAfford(S, i, S.cash)); return buyMode; }
function buyAgent(i, n) {
  if (agentLocked(i)) return false;
  const c = E.agentCost(S, i, n); if (c > S.cash) { sfx.deny(); return false; }
  S.cash -= c; S.agents[i] += n; markDirty(true); sfx.buy(); return true;
}
function upgVisible(u) {
  if (S.upg[u.id]) return false;
  if (u.kind === 'tier') return S.agents[u.agent] >= u.at;
  if (u.kind === 'syn') return S.agents[u.a] >= u.need[0] && S.agents[u.b] >= u.need[1];
  if (u.kind === 'global') return S.maxLevel >= u.need;
  return S.runEarned * 4 >= u.cost || S.cash * 4 >= u.cost;
}
function buyUpg(u, quiet) {
  if (S.upg[u.id] || S.challenge === 'notests') return false;
  const c = E.upgCost(S, u); if (c > S.cash) { if (!quiet) sfx.deny(); return false; }
  S.cash -= c; S.upg[u.id] = 1; markDirty(true); if (!quiet) sfx.buy();
  if (u.eff.weapon) { if (!quiet) S.weapon = u.eff.weapon; toast('🧨', `New cannon mode: ${E.WEAPONS[u.eff.weapon].name}`, `Press ${u.eff.weapon + 1} to switch. ${E.WEAPONS[u.eff.weapon].sub}.`); }
  return true;
}
function buyCannon(n) {
  const c = E.cannonCost(S, n); if (c > S.cash) { sfx.deny(); return false; }
  S.cash -= c; S.cannon += n; markDirty(); sfx.buy(); return true;
}
function autoHire() {
  for (let k = 0; k < 300; k++) {
    let best = -1, br = 0;
    for (let i = 0; i < E.AGENTS.length; i++) {
      if (agentLocked(i) || !(i === 0 || S.agents[i - 1] > 0)) continue;
      const r = E.AGENTS[i].dps * D.agentMult[i] / E.agentCost(S, i);
      if (r > br) { br = r; best = i; }
    }
    if (best < 0 || E.agentCost(S, best) > S.cash) break;
    S.cash -= E.agentCost(S, best); S.agents[best]++; markDirty(true); refresh();
  }
}
function autoUpgrade() {
  if (S.challenge === 'notests') return;
  for (const u of E.UPGRADES) if (upgVisible(u) && E.upgCost(S, u) <= S.cash) { buyUpg(u, true); refresh(); }
}

// ───────────── prestige ─────────────
function canPivot() { return S.maxLevel >= E.PIVOT_LEVEL && E.pendingHype(S) >= 1; }
function doPivot(intoChallenge = null) {
  const h = E.pendingHype(S);
  S.hype += h; S.hypeClaimed += h; S.pivots++;
  S.challenge = intoChallenge;
  E.newRun(S);
  if (S.challenge) { S.level = 1; S.maxLevel = 1; }
  resetRunRuntime(); markDirty(true); save(); sfx.pivot();
  banner(intoChallenge ? `POSTMORTEM: ${E.CHALLENGES.find(c => c.id === intoChallenge).name.toUpperCase()}` : 'PIVOTED TO AI 🚀', intoChallenge ? E.CHALLENGES.find(c => c.id === intoChallenge).rule : `+${fmt(h)} hype · investors are thrilled`, '#c77dff');
}
function doRust() {
  const c = E.crabsFor(S.eraMax); if (c < 1) return;
  S.crabs += c; S.crabsEver += c; S.rusts++;
  const keep = .1 * E.lv(S.rust, 'clippy');
  for (const id in S.board) S.board[id] = Math.floor(S.board[id] * keep);
  S.hype = 0; S.hypeClaimed = 0; S.eraEarned = 0; S.eraMax = 1; S.challenge = null;
  E.newRun(S); resetRunRuntime(); markDirty(true); save(); sfx.pivot();
  banner('REWRITTEN IN RUST 🦀', `+${fmt(c)} crabs · blazingly fast · memory safe · still down`, '#ff8a3d');
}
function completeChallenge() {
  const c = E.CHALLENGES.find(c => c.id === S.challenge); if (!c) return;
  S.chDone[c.id] = 1; S.challenge = null; markDirty(true); sfx.clear();
  modal(`${c.icon} Postmortem complete`, `<p><b>${c.name}</b> is now closed as <i>"won't fix"</i>.</p><p class="good">Permanent reward: ${c.reward}</p><p class="dim">Restrictions lifted. Keep going or pivot when you're ready.</p>`, [{ label: 'Blameless.', cls: 'primary' }]);
}

// ───────────── levels ─────────────
const TYPES = {
  pod: { w: 1.7, h: 2.8, d: 1.7, m: .6, acc: [120, 255, 90], body: [22, 30, 34] },
  api: { w: 2.6, h: 4.6, d: 2.2, m: 1, acc: [60, 210, 255], body: [24, 26, 42] },
  db: { w: 3.4, h: 6.6, d: 2.8, m: 1.7, acc: [255, 60, 200], body: [28, 22, 40] },
  lb: { w: 4.4, h: 1.8, d: 2.6, m: .9, acc: [255, 210, 60], body: [34, 30, 26] },
  boss: { w: 9, h: 13, d: 5, m: 1, acc: [255, 70, 70], body: [40, 22, 26] },
};
let phase = 'fight', phaseT = 0, bossT = 0, bossMax = 30, nextId = 1, levelKills = 0;
function makeServer(type, x, z, hp, rm, name, delay) {
  const d = TYPES[type];
  return {
    id: nextId++, type, name, x, bx: x, z, w: d.w, h: d.h, d: d.d, hp, maxHp: hp, rmult: rm, acc: d.acc, body: d.body, accS: `rgb(${d.acc})`,
    hitT: 0, lastHit: T, dead: false, deadT: 0, amp: type === 'pod' ? rand(2.5, 5) : 0, spd: rand(.4, .9), ph: rand(0, 6.3), sp: 0, spDelay: delay, treasure: false,
  };
}
function startLevel() {
  servers = []; projs = []; later = []; phase = 'fight'; levelKills = 0;
  const l = S.level;
  if (E.isBoss(l)) {
    const s = makeServer('boss', 0, 72, E.hp(l), 1, E.bossName(l), 0);
    if (l === E.FINAL) { s.w = 14; s.h = 17; s.d = 7; s.acc = [255, 160, 40]; s.accS = 'rgb(255,160,40)'; }
    servers.push(s);
    bossMax = bossT = D.bossTime;
    alert(1, `${s.name} detected — ${fmt(bossMax)}s to take it down`);
    musicIntensity = 1;
    return;
  }
  musicIntensity = 0;
  const types = [], used = new Set();
  for (let i = 0; i < E.PER_LEVEL; i++) { const r = Math.random(); types.push(l < 3 ? (r < .5 ? 'pod' : 'api') : r < .3 ? 'pod' : r < .6 ? 'api' : r < .82 ? 'db' : 'lb'); }
  const msum = types.reduce((a, t) => a + TYPES[t].m, 0), norm = E.PER_LEVEL / msum, hp = E.hp(l);
  const treasure = Math.random() < 1 / 30 ? Math.random() * E.PER_LEVEL | 0 : -1;
  types.forEach((t, i) => {
    const d = TYPES[t];
    for (let tries = 0; tries < 80; tries++) {
      const z = rand(22, 74), x = rand(-z * .62, z * .62), amp = t === 'pod' ? 5 : 0;
      if (servers.some(o => Math.abs(x - o.bx) < (d.w + o.w) / 2 + 1.5 + amp + o.amp && Math.abs(z - o.z) < (d.d + o.d) / 2 + 3)) continue;
      let name;
      for (let k = 0; k < 20; k++) { name = pick(NAMES[t]); if (t === 'pod') name += '-' + (Math.random() * 65536 | 0).toString(16); if (!used.has(name)) break; }
      used.add(name);
      const m = d.m * norm, s = makeServer(t, x, z, hp * m, m, name, i * .05);
      if (i === treasure) { s.treasure = true; s.name = 's3 bucket (public)'; s.rmult *= 10; s.accS = '#ffd23f'; }
      servers.push(s);
      break;
    }
  });
}
function setLevel(n) {
  n = clamp(n, 1, S.maxLevel); if (n === S.level && phase === 'fight') return;
  S.level = n; startLevel(); sfx.click();
}
function levelClear() {
  const l = S.level, boss = E.isBoss(l);
  phase = 'clear'; phaseT = boss ? 2.2 : .9;
  if (l >= S.maxLevel) S.maxLevel = l + 1;
  S.eraMax = Math.max(S.eraMax, S.maxLevel); S.allMax = Math.max(S.allMax, S.maxLevel);
  if (S.auto && S.level < S.maxLevel) S.level++;
  if (boss) { sfx.clear(); banner(l === E.FINAL ? 'us-east-1 IS DOWN' : 'LEGACY SYSTEM DECOMMISSIONED', l === E.FINAL ? 'half the internet is offline' : `incident ${l} resolved`, '#5dff9b'); }
  else sfx.level();
  if (S.challenge) { const c = E.CHALLENGES.find(c => c.id === S.challenge); if (c && S.maxLevel > c.goal) completeChallenge(); }
  if (l === E.FINAL && !S.seenUnlocks.ending) { S.seenUnlocks.ending = 1; later.push({ t: 2.5, f: showEnding }); }
  markDirty(true);
}
function bossEscaped() {
  const s = servers[0];
  if (s) { say(s.x, s.h + 2, s.z, '↺ ROLLED BACK', '#62ff9e', 1.6, 2, 1); s.dead = true; s.deadT = 1.6; }
  alert(1, `${s ? s.name : 'Boss'} survived — auto-advance off. Farm, upgrade, retry.`);
  sfx.fail(); G.bossFail = true; S.auto = false;
  S.level = Math.max(1, S.level - 1); phase = 'clear'; phaseT = 1.6; markDirty(true);
}

// ───────────── combat ─────────────
const AGENT_INT = E.AGENTS.map((_, i) => .6 + (i % 5) * .09);
let agentT = E.AGENTS.map(() => rand(0, 1)), cronT = 0, cool = 0, firing = false, side = 1;
function liveTarget() {
  const alive = servers.filter(s => !s.dead && s.sp > .4);
  return alive.length ? pick(alive) : null;
}
function mkProj(pos, v, o) {
  projs.push(Object.assign({ x: pos[0], y: pos[1], z: pos[2], vx: v[0], vy: v[1], vz: v[2], g: 12, life: 6, age: 0, aoe: 0, homing: null, split: 0, size: .75, src: 'cannon', spr: null }, o));
}
function ballistic(from, to, speed, g) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], Tf = Math.max(.15, Math.hypot(dx, dy, dz) / speed);
  return [dx / Tf, dy / Tf + .5 * g * Tf, dz / Tf, Tf];
}
function shotDmg(mult) { return E.shotDamage(D, dpsBuff()) * shotBuff() * mult; }
function rollCrit(dmg) { const c = Math.random() < D.crit; return [c ? dmg * D.critMult : dmg, c]; }
function fireCannon() {
  const w = D.weapons[S.weapon] ? S.weapon : 0, WP = E.WEAPONS[w];
  cool = WP.cd / D.rate;
  const o = [cam.x, cam.y, cam.z], d = screenRay(aimX, aimY), hit = raycast(o, d), m = muzzleWorld();
  const base = shotDmg(WP.mult);
  if (w === 3) {
    const tgt = hit.s || nearestToRay(o, d);
    for (let i = 0; i < 3; i++) {
      const v = camDir(rand(-1, 1) * .7, rand(.35, .8), .7), [dmg, crit] = rollCrit(base);
      mkProj(m, [v[0] * 26, v[1] * 26, v[2] * 26], { text: pick(VIBES), dmg, crit, homing: tgt, g: 0, life: 5, size: .8, col: WP.col, spr: WP.spr });
    }
  } else {
    const speed = [95, 62, 48][w], g = [12, 16, 14][w], tp = hit.p.slice();
    if (w === 0) { tp[0] += rand(-.3, .3); tp[1] += rand(-.3, .3); }
    const v = ballistic(m, tp, speed, g), [dmg, crit] = rollCrit(base);
    if (w === 0) mkProj(m, v, { text: pick(SLOP), dmg, crit, g, col: WP.col, spr: WP.spr });
    else if (w === 1) mkProj(m, v, { text: 'npm install', dmg, crit, g, split: v[3] * .55, size: .9, col: WP.col, spr: WP.spr });
    else mkProj(m, v, { text: 'DROP TABLE prod;', dmg, crit, g, aoe: 10, size: 1.3, col: WP.col, spr: WP.spr, drop: true });
  }
  S.stats.shots++; G.idleT = 0;
  recoil = Math.min(1.4, recoil + [.5, .8, 1.3, .7][w]); flash = 1; shake += [.04, .15, .5, .1][w] * QUALITY.shake; heat = Math.min(1, heat + [.05, .15, .35, .12][w]);
  glyphs(m[0], m[1], m[2], '{}();=>', 3, WP.col, 3);
  sfx.fire(w);
}
function fireCron() {
  const s = liveTarget(); if (!s) return;
  const m = muzzleWorld(), v = ballistic(m, [s.x, s.h * s.sp * .5, s.z - s.d / 2], 80, 12), [dmg, crit] = rollCrit(shotDmg(1) * .5);
  mkProj(m, v, { text: pick(SLOP), dmg, crit, g: 12, col: '#7df9ff', spr: 'cyan', src: 'cron', size: .65 });
  recoil = Math.min(1.4, recoil + .25); flash = .6;
}
function fireAgent(i) {
  const s = liveTarget(); if (!s) return;
  const a = E.AGENTS[i], dmg = D.agentDps[i] * AGENT_INT[i] * dpsBuff();
  side = -side;
  const from = localToWorld(side * rand(1.2, 2), -1.3, .6), v = camDir(side * rand(.2, .6), rand(.6, 1), .9);
  const alive = drones.filter(d => !d.dead), blocker = alive.length && Math.random() < Math.min(.6, .25 * alive.length) ? pick(alive) : null;
  mkProj(from, [v[0] * 22, v[1] * 22, v[2] * 22], { text: pick(a.lines), dmg, homing: s, g: 0, life: 5, size: .55, col: a.col, src: 'agent', agent: i, blocker });
  if (Math.random() < .3) sfx.agent();
}
function damage(s, dmg, x, y, z, kind, crit) {
  if (s.dead) return;
  s.hp -= dmg; s.hitT = 1; s.lastHit = T;
  if (kind === 'shot') { say(x + rand(-.4, .4), y + .4, z, (crit ? 'CRIT ' : '') + fmt(dmg), crit ? '#ff4d6d' : '#ffe08a', crit ? 1.4 : .9, crit ? 1 : .7); if (crit) { S.stats.crits++; sfx.crit(); } }
  if (s.hp <= 0) { const over = -s.hp; kill(s, kind); if (over > 0 && kind !== 'cascade') overflow(s, over); }
}
// Overkill damage chains to the nearest live server, so big DPS clears whole incidents in one volley.
function overflow(from, dmg) {
  const t = nearestAlive(from.x, from.z); if (!t) return;
  later.push({ t: .07, f: () => {
    if (t.dead) return overflow(from, dmg);
    beams.push({ a: [from.x, from.h * .6, from.z], b: [t.x, t.h * t.sp * .6, t.z], life: .3, max: .3, col: '125,249,255' });
    sparks(t.x, t.h * .6, t.z - t.d / 2, 8, 8, '#7df9ff');
    damage(t, dmg, t.x, t.h * .6, t.z, 'overflow');
  } });
}
function kill(s, kind) {
  s.dead = true; s.deadT = 0; s.hp = 0;
  const boss = s.type === 'boss', cx = s.x, cy = s.h * .5, cz = s.z;
  explosion(cx, cy, cz, boss || s.type === 'db');
  if (boss) {
    for (let i = 1; i < 6; i++) later.push({ t: i * .22, f: () => { explosion(cx + rand(-4, 4), rand(2, 11), cz + rand(-2, 2), true); sfx.boom(1); shake += .5 * QUALITY.shake; } });
    S.stats.bosses++; if (kind === 'drop') G.dropBoss = true; if (bossT < 1) G.closeCall = true;
  }
  shake += (boss ? 2 : .5) * QUALITY.shake; redFlash = boss ? .35 : .12; sfx.boom(boss ? 2 : .6);
  G.combo = G.comboT > 0 ? G.combo + 1 : 1; G.comboT = 2.5; comboPop = 1; G.bestCombo = Math.max(G.bestCombo, G.combo);
  const l = S.level, gold = E.reward(l) * s.rmult * D.gold * (boss ? D.bossGold : 1) * (1 + .01 * Math.min(G.combo - 1, 50));
  earn(gold); S.stats.kills++; if (G.idleT > 300) G.idleKills++;
  say(cx, s.h + 1.6, cz, '+' + money(gold), '#ffd23f', boss ? 2 : 1.1, 1.6, 1); coins(cx, s.h, cz, boss ? 30 : 6); sfx.coin();
  if (s.treasure) alert(0, `Public S3 bucket leaked — ${money(gold)} in "downtime"`);
  else if (boss) alert(1, `${s.name} is DOWN — ${pick(DOWN)}`);
  if (s.type === 'lb') for (const o of servers) {
    if (o === s || o.dead) continue;
    const dd = Math.hypot(o.x - cx, o.z - cz); if (dd >= 16) continue;
    beams.push({ a: [cx, cy, cz], b: [o.x, o.h * .5, o.z], life: .45, max: .45, col: '255,77,109' });
    later.push({ t: .18 + dd * .025, f: () => { if (o.dead) return; say(o.x, o.h + .8, o.z, 'CASCADING FAILURE', '#ff8a3d', 1, 1.3); sparks(o.x, o.h * .6, o.z - o.d / 2, 14, 10, '#ff8a3d'); damage(o, o.maxHp * .25, 0, 0, 0, 'cascade'); } });
  }
  if (++levelKills >= servers.length) levelClear();
}
function impact(p, h) {
  const { x, y, z, col } = p;
  part({ k: 'flash', x, y, z, life: .12, size: p.src === 'agent' ? 1.6 : 2.5, spr: p.spr || col });
  if (p.src !== 'agent' || Math.random() < .5) { sparks(x, y, z, p.src === 'agent' ? 4 : 9, 10, col); glyphs(x, y, z, p.text, p.src === 'agent' ? 2 : 5, col, 6); }
  if (h.gold) return collectGolden();
  if (h.s) { damage(h.s, p.dmg, x, y, z, p.src === 'agent' ? 'agent' : p.drop ? 'drop' : 'shot', p.crit); if (p.src !== 'agent') { hitMark = .2; sfx.hit(); } }
  else if (h.dr) hurtDrone(h.dr);
  else part({ k: 'ring', x, y: .05, z, vx: 0, vy: 0, vz: 0, life: .4, size: 0, grow: 6, g: 0, drag: 0, col });
  if (p.aoe) {
    explosion(x, Math.max(y, .5), z, true); sfx.boom(1.2); shake += .6 * QUALITY.shake;
    for (const s of servers) {
      if (s.dead || s === h.s) continue;
      const dd = Math.hypot(s.x - x, s.z - z), R = p.aoe + s.w / 2;
      if (dd < R) damage(s, p.dmg * .7 * (1 - dd / R * .6), s.x, s.h * .6, s.z - s.d / 2, 'shot');
    }
    for (const d of drones) if (!d.dead && Math.hypot(d.x - x, d.z - z) < p.aoe) hurtDrone(d, 3);
  }
}

// ───────────── zero-days, linters ─────────────
let goldenT = 40, droneT = 75;
function spawnGolden() {
  const sd = Math.random() < .5 ? -1 : 1;
  golden = { x: -sd * 38, y: rand(8, 14), z: rand(34, 56), vx: sd * rand(5, 6.5), life: 13, age: 0 };
  alert(0, `Zero-day disclosed in ${pick(PKGS)} — shoot the golden package!`); sfx.goldSpawn();
}
const GOLDEN = [
  { w: 42, f() { addBuff('frenzy', '🔥 PROD IS ON FIRE', 'Agent DPS x7', 30, { dps: 7 }); return 'PROD IS ON FIRE · agents x7'; } },
  { w: 38, f() { const g = Math.min(S.cash * .15, incomePerSec() * 900) + 13; earn(g); return `LEAKED API KEY · +${money(g)}`; } },
  { w: 12, f() { addBuff('caffeine', '☕ CAFFEINE IV', 'Shot damage x77', 13, { click: 77 }); return 'CAFFEINE IV · shots x77'; } },
  { w: 8, f() {
    const boss = servers.find(s => s.type === 'boss' && !s.dead);
    if (boss) { damage(boss, boss.maxHp * .1, 0, 0, 0, 'cascade'); return 'HOTFIX · boss -10% HP'; }
    for (const s of servers) if (!s.dead) damage(s, s.hp + 1, 0, 0, 0, 'cascade');
    return 'HOTFIX · incident auto-resolved';
  } },
];
function collectGolden() {
  const g = golden; golden = null; if (!g) return;
  let r = Math.random() * 100, eff = GOLDEN[0];
  for (const o of GOLDEN) { if ((r -= o.w) < 0) { eff = o; break; } }
  const msg = eff.f();
  S.stats.golden++; sfx.golden(); explosion(g.x, g.y, g.z, false); coins(g.x, g.y, g.z, 30);
  say(g.x, g.y + 2, g.z, msg, '#ffd23f', 2, 2.4, 1); alert(0, msg); hitMark = .3;
}
function addBuff(id, name, desc, secs, eff) {
  secs *= D.buffLen;
  const b = buffs.find(b => b.id === id);
  if (b) { b.t = b.max = Math.max(b.t, secs); } else buffs.push({ id, name, desc, t: secs, max: secs, ...eff });
  markDirty();
}
function spawnDrones() {
  const n = 1 + (S.level > 40) + (S.level > 90);
  for (let i = 0; i < n; i++) drones.push({ x: rand(-20, 20), y: 6, z: rand(20, 40), cx: rand(-14, 14), cz: rand(18, 36), t: rand(0, 9), ph: rand(0, 6.3), hp: 3, hitT: 0, dead: false, life: 45, name: pick(LINTERS) });
  alert(2, `Linters enabled — ${n > 1 ? n + ' drones are' : 'a drone is'} blocking agent deploys. Shoot them!`); sfx.pager();
}
function hurtDrone(d, n = 1) {
  d.hp -= n; d.hitT = 1; sparks(d.x, d.y, d.z, 10, 8, '#6fe3ff'); hitMark = .2; sfx.hit();
  if (d.hp > 0) return;
  d.dead = true; explosion(d.x, d.y, d.z, false); sfx.boom(.5);
  const g = incomePerSec() * 20 + 50; earn(g); S.stats.drones++;
  say(d.x, d.y + 1, d.z, `${d.name} disabled · +${money(g)}`, '#7fd8ff', 1.2, 1.8, 1);
}

// ───────────── simulation ─────────────
function resetRunRuntime() { buffs = []; drones = []; golden = null; G.combo = 0; startLevel(); }
let hireT = 0, cargoT = 0, achT = 0, saveT = 0;
function sim(dt) {
  refresh();
  S.stats.played += dt; S.runTime += dt; G.idleT += dt;
  // spawn-in animation & server behaviour
  for (const s of servers) {
    if (s.dead) { s.deadT += dt; continue; }
    if (s.spDelay > 0) s.spDelay -= dt; else s.sp = Math.min(1, s.sp + dt * 2.2);
    if (s.amp) s.x = s.bx + Math.sin(T * s.spd + s.ph) * s.amp;
    s.hitT = Math.max(0, s.hitT - dt * 5);
    if (S.challenge === 'k8s' && T - s.lastHit > 3 && s.hp < s.maxHp) { s.hp = s.maxHp; say(s.x, s.h + 1, s.z, '↺ SELF-HEALED', '#62ff9e', .9, 1.2); }
    const r = s.hp / s.maxHp;
    if (r < .6 && Math.random() < dt * 6) part({ k: 'smoke', x: s.x + rand(-.5, .5) * s.w, y: s.h, z: s.z, vx: rand(-.4, .4), vy: rand(1.5, 3), vz: rand(-.4, .4), life: rand(1.5, 3), size: rand(1, 2), grow: 1.4, g: -.3, drag: .4 });
    if (r < .3 && Math.random() < dt * 10) part({ k: 'fire', x: s.x + rand(-.4, .4) * s.w, y: s.h, z: s.z + rand(-.4, .4) * s.d, vx: 0, vy: rand(1, 3), vz: 0, life: rand(.3, .7), size: rand(.8, 1.6), g: -2, drag: 1 });
  }
  for (const s of servers) if (s.dead && s.deadT < 5 && Math.random() < dt * 10 * (1 - s.deadT / 5)) part({ k: 'fire', x: s.x + rand(-.4, .4) * s.w, y: s.h * .32, z: s.z + rand(-.4, .4) * s.d, vx: 0, vy: rand(1, 4), vz: 0, life: rand(.4, .9), size: rand(1, 2.4), g: -2, drag: 1 });
  // phase
  if (phase === 'clear') { phaseT -= dt; if (phaseT <= 0) startLevel(); }
  else if (E.isBoss(S.level) && servers.length && !servers[0].dead && servers[0].sp >= 1) {
    bossT -= dt; if (bossT <= 0) bossEscaped();
  }
  // firing
  cool -= dt;
  if (firing && hoverCanvas && cool <= 0 && !modalOpen()) fireCannon();
  if (D.cron > 0 && phase === 'fight') { cronT -= dt; if (cronT <= 0) { cronT += 1 / D.cron; fireCron(); } }
  if (phase === 'fight') for (let i = 0; i < E.AGENTS.length; i++) {
    if (!S.agents[i] || !(D.agentDps[i] > 0)) continue;
    agentT[i] -= dt; if (agentT[i] <= 0) { agentT[i] += AGENT_INT[i]; fireAgent(i); }
  }
  // projectiles
  outer: for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; p.age += dt; p.life -= dt;
    if (p.blocker && p.age > .35) {
      const d = p.blocker; projs.splice(i, 1);
      if (!d.dead) { beams.push({ a: [d.x, d.y, d.z], b: [p.x, p.y, p.z], life: .18, max: .18, col: '111,227,255' }); sparks(p.x, p.y, p.z, 6, 6, '#6fe3ff'); if (Math.random() < .3) say(p.x, p.y + .5, p.z, pick(LINT), '#6fe3ff', .7, .8); if (Math.random() < .3) sfx.laser(); }
      continue;
    }
    if (p.homing) {
      if (p.homing.dead) p.homing = nearestAlive(p.x, p.z);
      const s = p.homing;
      if (s) {
        const tx = s.x - p.x, ty = s.h * s.sp * .5 - p.y, tz = s.z - p.z, L = Math.hypot(tx, ty, tz) || 1, k = Math.min(1, dt * 2.8 * (1 + p.age * 1.5)), sp = p.src === 'agent' ? 50 : 46;
        p.vx = lerp(p.vx, tx / L * sp, k); p.vy = lerp(p.vy, ty / L * sp, k); p.vz = lerp(p.vz, tz / L * sp, k);
      } else p.vy -= 12 * dt;
    } else p.vy -= p.g * dt;
    if (p.split && p.age >= p.split) {
      for (let j = 0; j < 8; j++) { const [dmg, crit] = rollCrit(p.dmg / (p.crit ? D.critMult : 1)); mkProj([p.x, p.y, p.z], [p.vx + rand(-7, 7), p.vy + rand(-2, 4), p.vz + rand(-5, 5)], { text: pick(PKGS), dmg, crit, g: 20, size: .6, col: p.col, spr: p.spr }); }
      glyphs(p.x, p.y, p.z, '📦{}[]', 8, p.col, 6); part({ k: 'flash', x: p.x, y: p.y, z: p.z, life: .15, size: 3, spr: 'yel' });
      projs.splice(projs.indexOf(p), 1); continue;
    }
    const sp = Math.hypot(p.vx, p.vy, p.vz), n = Math.max(1, Math.ceil(sp * dt / .35)), hs = dt / n;
    let hit = null;
    for (let k = 0; k < n && !hit; k++) { p.x += p.vx * hs; p.y += p.vy * hs; p.z += p.vz * hs; hit = collide(p); }
    if (hit) { projs.splice(projs.indexOf(p), 1); impact(p, hit); continue; }
    if (p.life <= 0 || p.z > 260 || p.z < -20) { projs.splice(projs.indexOf(p), 1); continue; }
    if (Math.random() < (p.src === 'agent' ? .35 : .8)) part({ k: 'glyph', x: p.x, y: p.y, z: p.z, vx: rand(-1, 1), vy: rand(-.5, 1), vz: rand(-1, 1), life: rand(.3, .6), ch: p.text[Math.random() * p.text.length | 0], col: p.col, size: .32, g: 0, drag: 1 });
  }
  // drones & golden
  for (const d of drones) {
    if (d.dead) continue;
    d.t += dt; d.life -= dt; d.hitT = Math.max(0, d.hitT - dt * 5);
    d.x = d.cx + Math.sin(d.t * .6 + d.ph) * 8; d.z = d.cz + Math.sin(d.t * .4 + d.ph * 2) * 4; d.y = 6 + Math.sin(d.t * 1.7) * .9;
    if (d.life <= 0) { d.dead = true; say(d.x, d.y + 1, d.z, `${d.name} got bored`, '#7fd8ff', .8, 1.2); }
  }
  drones = drones.filter(d => !d.dead);
  const lint = E.lv(S.board, 'linter');
  if (S.maxLevel >= 10 && lint < 5 && !drones.length) { droneT -= dt * (1 - .2 * lint); if (droneT <= 0) { droneT = rand(50, 110); spawnDrones(); } }
  if (golden) { golden.age += dt; golden.life -= dt; golden.x += golden.vx * dt; golden.y += Math.sin(golden.age * 2.2) * dt * 1.5; if (golden.life <= 0) golden = null; }
  else if (D.golden > 0 && S.maxLevel >= 3) { goldenT -= dt * D.golden; if (goldenT <= 0) { goldenT = rand(90, 200); spawnGolden(); } }
  // buffs, combo, automation
  for (const b of buffs) b.t -= dt;
  if (buffs.some(b => b.t <= 0)) { buffs = buffs.filter(b => b.t > 0); markDirty(); }
  G.comboT -= dt; if (G.comboT <= 0) G.combo = 0;
  if (D.hiring) { hireT -= dt; if (hireT <= 0) { hireT = 8 / D.hiring; autoHire(); } }
  if (E.lv(S.rust, 'cargo')) { cargoT -= dt; if (cargoT <= 0) { cargoT = 1.5; autoUpgrade(); } }
  for (let i = later.length - 1; i >= 0; i--) { const l = later[i]; l.t -= dt; if (l.t <= 0) { later.splice(i, 1); l.f(); } }
  achT -= dt; if (achT <= 0) { achT = .5; checkAchievements(); }
  saveT -= dt; if (saveT <= 0) { saveT = 15; save(); }
}

// ───────────── achievements ─────────────
function checkAchievements() {
  let n = 0;
  for (const a of ACHIEVEMENTS) {
    if (S.ach[a.id]) continue;
    let ok = false; try { ok = a.test(S, G); } catch (e) { }
    if (ok) { S.ach[a.id] = Date.now(); n++; toast(a.icon, `Trophy: ${a.name}`, `${a.desc} · +3% damage`, 'ach'); }
  }
  if (n) { sfx.ach(); markDirty(true); }
}

// ───────────── render ─────────────
function render(dt) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.textBaseline = 'middle'; ctx.lineCap = 'butt';
  const sx = (Math.random() * 2 - 1) * shake * 10, sy = (Math.random() * 2 - 1) * shake * 10;
  ctx.save(); ctx.translate(sx, sy);
  const hy = drawSky(E.isBoss(S.level)); drawGround(hy); drawWorld(); drawAdditive(); drawLabels();
  ctx.restore();
  const w = D.weapons[S.weapon] ? S.weapon : 0, WP = E.WEAPONS[w];
  ctx.save(); ctx.translate(sx * .4, sy * .4);
  drawCannon({ col: WP.col, spr: WP.spr, name: WP.name, sub: WP.sub, shot: shotDmg(WP.mult), cool: clamp(1 - cool / (WP.cd / D.rate), 0, 1), level: S.level, dps: D.dps * dpsBuff(), agents: S.agents.reduce((a, b) => a + b, 0) });
  ctx.restore();
  if (hoverCanvas) drawCrosshair(WP.col);
  ctx.drawImage(VIG, 0, 0, W, H);
  ctx.fillStyle = SCAN; ctx.fillRect(0, 0, W, H);
  if (redFlash > 0) { ctx.fillStyle = `rgba(255,60,40,${redFlash * .4})`; ctx.fillRect(0, 0, W, H); }
  if (E.isBoss(S.level) && phase === 'fight' && bossT < 8) { ctx.globalAlpha = (Math.sin(T * 6) * .5 + .5) * .5; ctx.fillStyle = '#ff0033'; ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(VIG, 0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
  drawAlerts(W < 700 ? 150 : 96);
  if (G.combo >= 3) {
    const s = 1 + comboPop * .4; ctx.save(); ctx.translate(W / 2, H * .76); ctx.scale(s, s);
    txt(`x${G.combo} CASCADING FAILURE · +${Math.min(G.combo - 1, 50)}% $`, 0, 0, 16, '#ff8a3d', 'center', DISP, 900); ctx.restore();
  }
}

// ───────────── UI: generic pieces ─────────────
const toastsEl = $('#toasts'), tipEl = $('#tooltip'), modalEl = $('#modal');
function toast(icon, title, body, cls = '') {
  const el = h('div', { class: 'toast ' + cls }, h('div', { class: 'ticon' }, icon), h('div', {}, h('b', {}, title), h('div', { class: 'dim' }, body)));
  toastsEl.prepend(el); while (toastsEl.children.length > 4) toastsEl.lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 5200);
}
function banner(title, sub, col) {
  const el = $('#banner'); el.innerHTML = ''; el.append(h('div', { class: 'btitle', 'data-t': title, style: `color:${col || '#fff'}` }, title), h('div', { class: 'bsub' }, sub));
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
const modalOpen = () => !modalEl.hidden;
function modal(title, html, buttons) {
  modalEl.innerHTML = '';
  const card = h('div', { class: 'mcard' }, h('h2', {}, title), h('div', { class: 'mbody', html }),
    h('div', { class: 'mbtns' }, ...(buttons || [{ label: 'OK', cls: 'primary' }]).map(b => h('button', { class: 'btn ' + (b.cls || ''), onclick: () => { if (b.onclick && b.onclick() === false) return; closeModal(); } }, b.label))));
  modalEl.append(card); modalEl.hidden = false; firing = false;
}
function closeModal() { modalEl.hidden = true; }
modalEl.addEventListener('mousedown', e => { if (e.target === modalEl) closeModal(); });
document.addEventListener('mousemove', e => {
  let el = e.target; while (el && !el._tip) el = el.parentElement;
  if (!el) { tipEl.hidden = true; return; }
  const c = typeof el._tip === 'function' ? el._tip() : el._tip; if (!c) { tipEl.hidden = true; return; }
  setHTML(tipEl, c); tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect(), x = Math.min(e.clientX + 16, innerWidth - r.width - 8), y = Math.min(e.clientY + 16, innerHeight - r.height - 8);
  tipEl.style.transform = `translate(${Math.max(8, x)}px,${Math.max(8, y)}px)`;
});

// ───────────── UI: top bar ─────────────
const ui = {
  cash: $('#cash'), income: $('#income'), dpsl: $('#dpsline'), lvlStrip: $('#lvlStrip'), lvlInfo: $('#lvlInfo'), boss: $('#bossbar'), bossFill: $('#bossfill'), bossTxt: $('#bosstxt'),
  auto: $('#autoBtn'), chips: $('#chips'), buffs: $('#buffs'), weapons: $('#weapons'), chBanner: $('#chBanner'),
};
$('#lvlPrev').onclick = () => setLevel(S.level - 1);
$('#lvlNext').onclick = () => setLevel(S.level + 1);
ui.auto.onclick = () => { S.auto = !S.auto; sfx.click(); };
const lvlBoxes = [];
for (let i = 0; i < 5; i++) { const b = h('button', { class: 'lvl', onclick: () => setLevel(+b.dataset.l) }); lvlBoxes.push(b); ui.lvlStrip.append(b); }
const weaponBtns = E.WEAPONS.map((w, i) => {
  const b = h('button', { class: 'wpn', style: `--c:${w.col}`, onclick: () => selectWeapon(i), tip: () => `<b style="color:${w.col}">${w.name}</b><br>${w.sub}<br><span class="dim">x${w.mult} per shot · ${(1 / w.cd).toFixed(1)} shots/s</span>` },
    h('span', { class: 'k' }, i + 1), h('span', { class: 'n' }, w.name));
  ui.weapons.append(b); return b;
});
function selectWeapon(i) { if (D.weapons[i] && S.weapon !== i) { S.weapon = i; sfx.click(); } }
function updateTop() {
  setText(ui.cash, money(S.cash));
  setText(ui.income, `+${money(incomePerSec())}/s idle`);
  setText(ui.dpsl, `AGENT DPS ${fmt(D.dps * dpsBuff())} · SHOT ${fmt(shotDmg(E.WEAPONS[S.weapon].mult))}${D.cron ? ` · CRON ${D.cron}/s` : ''}`);
  const l = S.level, start = clamp(l - 2, 1, Math.max(1, S.maxLevel - 3));
  lvlBoxes.forEach((b, i) => {
    const n = start + i; b.dataset.l = n; setText(b, n === E.FINAL ? '☁' : String(n));
    b.className = 'lvl' + (n === l ? ' cur' : '') + (E.isBoss(n) ? ' boss' : '') + (n > S.maxLevel ? ' locked' : '') + (n === S.maxLevel && n !== l ? ' frontier' : '');
  });
  const boss = E.isBoss(l), alive = servers.filter(s => !s.dead).length;
  setText(ui.lvlInfo, boss ? `⚠ BOSS · ${E.bossName(l)}` : `INCIDENT ${l} · ${E.PER_LEVEL - alive}/${E.PER_LEVEL} servers down`);
  ui.boss.hidden = !(boss && phase === 'fight');
  if (boss) { ui.bossFill.style.transform = `scaleX(${clamp(bossT / bossMax, 0, 1)})`; setText(ui.bossTxt, `${Math.max(0, bossT).toFixed(1)}s`); }
  setText(ui.auto, S.auto ? 'AUTO ▶▶' : 'FARMING ⟳'); ui.auto.classList.toggle('off', !S.auto);
  let chips = '';
  if (S.hype > 0 || S.pivots) chips += `<span class="chip hype" title="Hype">🚀 ${fmt(S.hype)} <i>+${fmt(S.hype * E.hypeEach(S) * 100)}%</i></span>`;
  if (S.crabsEver > 0) chips += `<span class="chip crab">🦀 ${fmt(S.crabs)}</span>`;
  const na = Object.keys(S.ach).length; if (na) chips += `<span class="chip ach">🏆 ${na} <i>+${na * 3}%</i></span>`;
  setHTML(ui.chips, chips);
  setHTML(ui.buffs, buffs.map(b => `<div class="buff"><b>${b.name}</b> ${b.desc} · ${Math.ceil(b.t)}s<i style="transform:scaleX(${b.t / b.max})"></i></div>`).join(''));
  weaponBtns.forEach((b, i) => { b.hidden = !D.weapons[i]; b.classList.toggle('sel', S.weapon === i); });
  ui.weapons.hidden = D.weapons.filter(Boolean).length < 2;
  const ch = S.challenge && E.CHALLENGES.find(c => c.id === S.challenge);
  ui.chBanner.hidden = !ch;
  if (ch) setHTML(ui.chBanner, `${ch.icon} POSTMORTEM: <b>${ch.name}</b> — ${ch.rule} Goal: clear incident ${ch.goal}. <button class="btn small" id="abandon">Abandon</button>`);
}
ui.chBanner.addEventListener('click', e => { if (e.target.id === 'abandon') modal('Abandon postmortem?', '<p>This pivots you out of the postmortem without completing it.</p>', [{ label: 'Abandon', cls: 'danger', onclick: () => doPivot(null) }, { label: 'Keep going' }]); });

// ───────────── UI: panel tabs ─────────────
const TABS = [
  { id: 'agents', icon: '🤖', name: 'Agents', show: () => true },
  { id: 'upgrades', icon: '⬆️', name: 'Upgrades', show: () => true },
  { id: 'cannon', icon: '🔫', name: 'Cannon', show: () => true },
  { id: 'board', icon: '🚀', name: 'Pivot', show: () => S.pivots > 0 || S.allMax >= 15 || S.rusts > 0 },
  { id: 'post', icon: '📝', name: 'Postmortems', show: () => S.pivots >= E.CHALLENGE_PIVOTS || S.rusts > 0 },
  { id: 'rust', icon: '🦀', name: 'Rust', show: () => S.allMax >= 100 || S.rusts > 0 },
  { id: 'trophies', icon: '🏆', name: 'Trophies', show: () => true },
  { id: 'stats', icon: '📊', name: 'Stats', show: () => true },
  { id: 'settings', icon: '⚙️', name: 'Settings', show: () => true },
];
let curTab = 'agents';
const tabBar = $('#tabs'), tabBody = $('#tabBody'), tabBtns = {};
for (const t of TABS) {
  tabBtns[t.id] = h('button', { class: 'tab', onclick: () => { curTab = t.id; S.seenUnlocks['tab_' + t.id] = 1; structDirty = true; sfx.click(); } }, h('span', { class: 'ti' }, t.icon), h('span', { class: 'tn' }, t.name), h('span', { class: 'new' }, 'NEW'), h('span', { class: 'cnt' }));
  tabBar.append(tabBtns[t.id]);
}
document.querySelectorAll('#buyAmt button').forEach(b => b.onclick = () => { buyMode = b.dataset.n === 'max' ? 'max' : +b.dataset.n; sfx.click(); updateBuyAmt(); });
function updateBuyAmt() { document.querySelectorAll('#buyAmt button').forEach(b => b.classList.toggle('sel', String(buyMode) === b.dataset.n)); }
updateBuyAmt();

let tabUpdate = () => { }, tabKey = '';
function tabsVisibility() {
  for (const t of TABS) {
    const vis = t.show(), b = tabBtns[t.id];
    if (vis && b.hidden !== false) { b.hidden = false; if (!S.seenUnlocks['tab_' + t.id] && ['board', 'post', 'rust'].includes(t.id)) { b.classList.add('isnew'); toast(t.icon, `Unlocked: ${t.name}`, 'A new tab opened in the side panel.'); } }
    b.hidden = !vis;
    b.classList.toggle('sel', curTab === t.id);
    if (t.id === 'upgrades') { const n = S.challenge === 'notests' ? 0 : E.UPGRADES.filter(u => u.kind !== 'cannon' && upgVisible(u) && E.upgCost(S, u) <= S.cash).length; setText(b.lastChild, n ? String(n) : ''); b.lastChild.hidden = !n; }
    if (S.seenUnlocks['tab_' + t.id]) b.classList.remove('isnew');
  }
  $('#buyAmt').hidden = !(curTab === 'agents' || curTab === 'cannon');
}
function buildTab() {
  tabBody.innerHTML = ''; structDirty = false;
  const t = BUILD[curTab](); tabUpdate = t || (() => { });
}
function structKey() {
  if (curTab === 'agents') return S.agents.map((n, i) => agentVisible(i) ? 1 : 0).join('') + S.challenge;
  if (curTab === 'upgrades') return E.UPGRADES.filter(upgVisible).map(u => u.id).join() + '|' + Object.keys(S.upg).length + S.challenge;
  if (curTab === 'cannon') return E.UPGRADES.filter(u => u.kind === 'cannon' && (upgVisible(u) || S.upg[u.id])).length + '';
  if (curTab === 'board') return S.pivots + '' + S.rusts;
  if (curTab === 'post') return S.challenge + Object.keys(S.chDone).join();
  if (curTab === 'rust') return S.rusts + '';
  if (curTab === 'trophies') return Object.keys(S.ach).length + '';
  return '';
}
const costBtn = (label, onclick) => { const b = h('button', { class: 'buy', onclick }, h('span', { class: 'bl' }, label), h('span', { class: 'bc' })); return b; };

const BUILD = {
  agents() {
    const rows = [];
    const list = h('div', { class: 'list' });
    let teaser = false;
    {
      const own = h('div', { class: 'aown' }), stat = h('div', { class: 'astat' });
      const btn = costBtn('CALIBRE', () => buyCannon(buyMode === 'max' ? Math.max(1, E.cannonMax(S, S.cash)) : buyMode));
      list.append(h('div', { class: 'row agent', style: '--c:#ffd23f' }, h('div', { class: 'aicon' }, '🔫'),
        h('div', { class: 'amain' }, h('div', { class: 'aname' }, 'Slop Cannon (you)', own), h('div', { class: 'adesc' }, 'Hold the mouse on prod to fire. Calibre adds base shot damage.'), stat), btn));
      rows.push(() => {
        const n = buyMode === 'max' ? Math.max(1, E.cannonMax(S, S.cash)) : buyMode, c = E.cannonCost(S, n);
        setText(own, 'Lv ' + S.cannon); setText(stat, `${fmt(shotDmg(E.WEAPONS[S.weapon].mult))} per shot · ${(D.rate / E.WEAPONS[S.weapon].cd).toFixed(1)} shots/s`);
        setText(btn.firstChild, `+${n} CALIBRE`); setText(btn.lastChild, money(c)); btn.classList.toggle('no', c > S.cash);
      });
    }
    E.AGENTS.forEach((a, i) => {
      if (!agentVisible(i)) {
        if (teaser) return; teaser = true;
        const el = h('div', { class: 'row agent locked' }, h('div', { class: 'aicon' }, '❔'), h('div', { class: 'amain' }, h('div', { class: 'aname' }, `??? — hire a ${E.AGENTS[i - 1].name} to reveal`.replace(/ a ([AEIOU])/, ' an $1')), h('div', { class: 'adesc dim' }, 'Cost: ' + money(a.cost))));
        list.append(el); return;
      }
      const owned = h('div', { class: 'aown' }), stat = h('div', { class: 'astat' }), bar = h('i'), next = h('div', { class: 'anext' });
      const readyUpg = () => E.UPGRADES.find(u => u.kind === 'tier' && u.agent === i && !S.upg[u.id] && S.agents[i] >= u.at);
      const upBtn = h('button', { class: 'upbtn', onclick: e => { e.stopPropagation(); const u = readyUpg(); if (u) buyUpg(u); } });
      const btn = costBtn('HIRE', () => buyAgent(i, buyCount(i)));
      const el = h('div', { class: 'row agent', style: `--c:${a.col}`, tip: () => agentTip(i) },
        h('div', { class: 'aicon' }, a.icon),
        h('div', { class: 'amain' }, h('div', { class: 'aname' }, a.name, owned), h('div', { class: 'adesc' }, a.desc), stat, h('div', { class: 'aprog' }, bar), next, upBtn),
        btn);
      list.append(el);
      rows.push(() => {
        const n = buyCount(i), c = E.agentCost(S, i, n), locked = agentLocked(i);
        setText(owned, fmt(S.agents[i]));
        const tot = D.dps || 1;
        setText(stat, S.agents[i] ? `${fmt(D.agentDps[i] / S.agents[i])} DPS each · ${fmt(D.agentDps[i])} total (${(D.agentDps[i] / tot * 100).toFixed(1)}%)` : `${fmt(a.dps * D.agentMult[i] * D.dmg)} DPS each`);
        const nt = E.TIER_AT.find(t => t > S.agents[i]), prev = [0, ...E.TIER_AT].filter(t => t <= S.agents[i]).pop();
        bar.style.transform = `scaleX(${nt ? (S.agents[i] - prev) / (nt - prev) : 1})`;
        setText(next, nt ? `next upgrade unlocks at ${nt}` : 'all upgrades unlocked');
        const ru = readyUpg(); upBtn.hidden = !ru || S.challenge === 'notests';
        if (ru) { const c = E.upgCost(S, ru); setText(upBtn, `⬆ ${ru.name} · ${a.name}s x${ru.eff.mult} · ${money(c)}`); upBtn.classList.toggle('no', c > S.cash); }
        setText(btn.lastChild, locked ? 'LOCKED' : money(c)); setText(btn.firstChild, locked ? 'POSTMORTEM' : `HIRE ×${n}`);
        btn.classList.toggle('no', locked || c > S.cash);
      });
    });
    tabBody.append(h('div', { class: 'hint' }, 'Agents fire slop at prod automatically. Every hire is 7% pricier; each owned milestone unlocks an upgrade.'), list);
    return () => rows.forEach(f => f());
  },
  upgrades() {
    const avail = E.UPGRADES.filter(u => u.kind !== 'cannon' && upgVisible(u));
    const tiles = [];
    const grid = h('div', { class: 'grid' });
    for (const u of avail) {
      const t = h('button', { class: 'tile', onclick: () => buyUpg(u), tip: () => upgTip(u) }, h('span', {}, u.icon), h('i', { class: 'tc' }));
      grid.append(t); tiles.push([t, u]);
    }
    const all = h('button', { class: 'btn', onclick: () => { let n = 0; for (const u of E.UPGRADES) if (u.kind !== 'cannon' && upgVisible(u) && buyUpg(u, true)) { n++; refresh(); } n ? sfx.buy() : sfx.deny(); } }, 'Buy all affordable');
    const owned = E.UPGRADES.filter(u => S.upg[u.id] && u.kind !== 'cannon');
    const og = h('div', { class: 'grid small' }, ...owned.map(u => h('div', { class: 'tile owned', tip: () => upgTip(u) }, h('span', {}, u.icon))));
    if (S.challenge === 'notests') tabBody.append(h('div', { class: 'warn' }, '🧪 Postmortem "No Tests": upgrades are disabled.'));
    tabBody.append(h('div', { class: 'sechead' }, h('span', {}, `Available (${avail.length})`), all), avail.length ? grid : h('div', { class: 'empty' }, 'Hire 10 of an agent to unlock its first upgrade.'),
      h('div', { class: 'sechead' }, h('span', {}, `Owned (${owned.length})`)), og);
    return () => tiles.forEach(([t, u]) => { const c = E.upgCost(S, u); t.classList.toggle('no', c > S.cash); setText(t.lastChild, fmt(c)); });
  },
  cannon() {
    const lvl = h('div', { class: 'big' }), info = h('div', { class: 'statgrid' });
    const btn = costBtn('UPGRADE', () => buyCannon(buyMode === 'max' ? Math.max(1, E.cannonMax(S, S.cash)) : buyMode));
    const card = h('div', { class: 'card' }, h('div', { class: 'cardhead' }, h('div', {}, h('div', { class: 'dim' }, 'CANNON CALIBRE'), lvl), btn), info);
    const list = h('div', { class: 'list' }), rows = [];
    for (const u of E.UPGRADES.filter(u => u.kind === 'cannon')) {
      if (!S.upg[u.id] && !upgVisible(u)) continue;
      const b = costBtn('BUY', () => buyUpg(u));
      const r = h('div', { class: 'row upg' + (S.upg[u.id] ? ' done' : '') }, h('div', { class: 'aicon' }, u.icon), h('div', { class: 'amain' }, h('div', { class: 'aname' }, u.name), h('div', { class: 'adesc' }, u.flav)), S.upg[u.id] ? h('div', { class: 'check' }, '✓') : b);
      list.append(r);
      if (!S.upg[u.id]) rows.push(() => { const c = E.upgCost(S, u); setText(b.lastChild, money(c)); b.classList.toggle('no', c > S.cash || S.challenge === 'notests'); });
    }
    tabBody.append(h('div', { class: 'hint' }, 'Hold the mouse on the battlefield to fire. Shots scale with calibre and a % of your agent DPS. Shoot golden 0-DAYs and linter drones!'), card, h('div', { class: 'sechead' }, h('span', {}, 'Cannon mods')), list);
    return () => {
      const n = buyMode === 'max' ? Math.max(1, E.cannonMax(S, S.cash)) : buyMode, c = E.cannonCost(S, n);
      setText(lvl, `Lv ${S.cannon}`); setText(btn.firstChild, `+${n} CALIBRE`); setText(btn.lastChild, money(c)); btn.classList.toggle('no', c > S.cash);
      const WP = E.WEAPONS[S.weapon];
      setHTML(info, [
        ['Base damage', fmt(D.shotBase)], ['+ of agent DPS', (D.pct * 100).toFixed(0) + '%'], ['Mode', `${WP.name} x${WP.mult}`], ['Shot damage', fmt(shotDmg(WP.mult))],
        ['Crit chance', (Math.min(1, D.crit) * 100).toFixed(0) + '%'], ['Crit damage', 'x' + fmt(D.critMult)], ['Fire rate', (D.rate / WP.cd).toFixed(1) + '/s'], ['Cron job', D.cron ? D.cron + ' shots/s' : '—'],
      ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join(''));
      rows.forEach(f => f());
    };
  },
  board() {
    const top = h('div', { class: 'card hypecard' }), pbtn = h('button', { class: 'btn big primary', onclick: confirmPivot }, 'PIVOT TO AI 🚀');
    top.append(h('div', { class: 'hypebig' }), h('div', { class: 'hypeinfo' }), pbtn);
    const list = h('div', { class: 'list' }), rows = [];
    for (const b of E.BOARD) {
      const lvl = h('span', { class: 'lv' }), desc = h('div', { class: 'adesc' }), btn = costBtn('HIRE', () => {
        const l = E.lv(S.board, b.id), c = E.boardCost(b, l); if (b.max && l >= b.max) return; if (c > S.hype) return sfx.deny();
        S.hype -= c; S.board[b.id] = l + 1; markDirty(true); sfx.buy();
      });
      list.append(h('div', { class: 'row board' }, h('div', { class: 'aicon' }, b.icon), h('div', { class: 'amain' }, h('div', { class: 'aname' }, b.name, lvl), desc), btn));
      rows.push(() => {
        const l = E.lv(S.board, b.id), c = E.boardCost(b, l), maxed = b.max && l >= b.max;
        setText(lvl, `Lv ${l}${b.max ? '/' + b.max : ''}`); setText(desc, `${b.desc(l)}${maxed ? '' : ' · next: ' + b.next}`);
        setText(btn.firstChild, maxed ? 'MAXED' : 'PROMOTE'); setText(btn.lastChild, maxed ? '—' : `🚀 ${fmt(c)}`); btn.classList.toggle('no', maxed || c > S.hype);
      });
    }
    tabBody.append(top, h('div', { class: 'sechead' }, h('span', {}, 'Board of Directors'), h('span', { class: 'dim' }, 'spending hype lowers its passive bonus')), list);
    return () => {
      const p = E.pendingHype(S), ok = canPivot();
      setHTML(top.children[0], `🚀 ${fmt(S.hype)} <small>hype</small>`);
      setHTML(top.children[1], `Each hype gives <b>+${(E.hypeEach(S) * 100).toFixed(0)}%</b> damage (now <b>+${fmt(S.hype * E.hypeEach(S) * 100)}%</b>).<br>` +
        (S.maxLevel >= E.PIVOT_LEVEL ? `Pivoting now grants <b class="good">+${fmt(p)} hype</b> → <b>+${fmt((S.hype + p) * E.hypeEach(S) * 100)}%</b>.` : `Reach incident <b>${E.PIVOT_LEVEL}</b> this run to pivot (now ${S.maxLevel}). Pending: +${fmt(p)}.`) +
        `<br><span class="dim">Hype = (downtime this era ÷ 480)^0.2. Earn more before pivoting for diminishing-but-real gains. Pivots: ${S.pivots}</span>`);
      pbtn.disabled = !ok; rows.forEach(f => f());
    };
  },
  post() {
    const list = h('div', { class: 'list' });
    for (const c of E.CHALLENGES) {
      const done = S.chDone[c.id], act = S.challenge === c.id;
      list.append(h('div', { class: 'row chal' + (done ? ' done' : '') + (act ? ' active' : '') }, h('div', { class: 'aicon' }, c.icon),
        h('div', { class: 'amain' }, h('div', { class: 'aname' }, c.name, h('span', { class: 'lv' }, `goal: incident ${c.goal}`)), h('div', { class: 'adesc' }, c.rule), h('div', { class: 'adesc good' }, 'Reward: ' + c.reward)),
        done ? h('div', { class: 'check' }, '✓') : act ? h('div', { class: 'check act' }, 'ACTIVE') : h('button', { class: 'btn', onclick: () => modal(`${c.icon} Start "${c.name}"?`, `<p>This <b>pivots</b> you (you still get pending hype) and restarts at incident 1 with this rule:</p><p class="warn">${c.rule}</p><p>Clear incident <b>${c.goal}</b> to win: <span class="good">${c.reward}</span></p>`, [{ label: 'Start postmortem', cls: 'primary', onclick: () => doPivot(c.id) }, { label: 'Cancel' }]) }, 'START')));
    }
    tabBody.append(h('div', { class: 'hint' }, 'Postmortems are challenge runs with a nasty rule. Complete one for a permanent reward. Your Board and hype still apply.'), list);
  },
  rust() {
    const top = h('div', { class: 'card rustcard' }), rbtn = h('button', { class: 'btn big rust', onclick: confirmRust }, 'REWRITE IT IN RUST 🦀');
    top.append(h('div', { class: 'hypebig' }), h('div', { class: 'hypeinfo' }), rbtn);
    const list = h('div', { class: 'list' }), rows = [];
    for (const r of E.RUST) {
      const lvl = h('span', { class: 'lv' }), desc = h('div', { class: 'adesc' }), btn = costBtn('BUY', () => {
        const l = E.lv(S.rust, r.id), c = E.rustCost(r, l); if (r.max && l >= r.max) return; if (c > S.crabs) return sfx.deny();
        S.crabs -= c; S.rust[r.id] = l + 1; markDirty(true); sfx.buy();
      });
      list.append(h('div', { class: 'row board' }, h('div', { class: 'aicon' }, r.icon), h('div', { class: 'amain' }, h('div', { class: 'aname' }, r.name, lvl), desc), btn));
      rows.push(() => {
        const l = E.lv(S.rust, r.id), c = E.rustCost(r, l), maxed = r.max && l >= r.max;
        setText(lvl, `Lv ${l}${r.max ? '/' + r.max : ''}`); setText(desc, `${r.desc(l)}${maxed ? '' : ' · next: ' + r.next}`);
        setText(btn.firstChild, maxed ? 'MAXED' : 'CRATE'); setText(btn.lastChild, maxed ? '—' : `🦀 ${fmt(c)}`); btn.classList.toggle('no', maxed || c > S.crabs);
      });
    }
    tabBody.append(top, h('div', { class: 'sechead' }, h('span', {}, 'The Borrow Checker')), list);
    return () => {
      const p = E.crabsFor(S.eraMax);
      setHTML(top.children[0], `🦀 ${fmt(S.crabs)} <small>crabs</small>`);
      setHTML(top.children[1], (S.eraMax >= E.RUST_LEVEL ? `Rewriting now grants <b class="good">+${fmt(p)} crabs</b> (2^((best incident − 110) ÷ 10)).` : `Reach incident <b>${E.RUST_LEVEL}</b> to rewrite (best this era: ${S.eraMax}).`) +
        `<br><span class="warn">Resets everything a pivot does, plus all hype and your Board.</span><br><span class="dim">Rewrites: ${S.rusts} · crabs earned: ${fmt(S.crabsEver)}</span>`);
      rbtn.disabled = p < 1; rows.forEach(f => f());
    };
  },
  trophies() {
    const n = Object.keys(S.ach).length;
    const grid = h('div', { class: 'grid' }, ...ACHIEVEMENTS.map(a => {
      const got = S.ach[a.id];
      return h('div', { class: 'tile ach' + (got ? ' got' : ''), tip: () => got || !a.secret ? `<b>${a.icon} ${a.name}</b><br>${a.desc}${got ? '<br><span class="good">Unlocked ✓ · +3% damage</span>' : ''}` : '<b>??? Secret trophy</b><br>Keep breaking things.' }, h('span', {}, got || !a.secret ? a.icon : '❓'));
    }));
    tabBody.append(h('div', { class: 'card' }, h('div', { class: 'big' }, `${n} / ${ACHIEVEMENTS.length}`), h('div', { class: 'dim' }, `Each trophy: +3% damage (now +${n * 3}%)`)), grid);
  },
  stats() {
    const box = h('div', { class: 'statgrid wide' });
    tabBody.append(box);
    return () => setHTML(box, [
      ['Downtime this run', money(S.runEarned)], ['Downtime this era', money(S.eraEarned)], ['Downtime all time', money(S.totalEarned)],
      ['Current incident', S.level], ['Best this run', S.maxLevel], ['Best ever', S.allMax],
      ['Run time', fmtTime(S.runTime)], ['Time played', fmtTime(S.stats.played)], ['Pivots', S.pivots], ['Rewrites', S.rusts],
      ['Servers down', fmt(S.stats.kills)], ['Bosses decommissioned', fmt(S.stats.bosses)], ['Shots fired', fmt(S.stats.shots)], ['Crits', fmt(S.stats.crits)],
      ['Zero-days exploited', fmt(S.stats.golden)], ['Linters disabled', fmt(S.stats.drones)], ['Best combo', G.bestCombo], ['Earned offline', money(S.stats.offline)],
      ['Damage multiplier', 'x' + fmt(D.dmg)], ['Agents owned', fmt(S.agents.reduce((a, b) => a + b, 0))],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join(''));
  },
  settings() {
    const st = S.settings;
    const slider = (label, key, apply) => h('label', { class: 'set' }, h('span', {}, label), h('input', { type: 'range', min: 0, max: 1, step: .05, value: st[key], oninput: e => { st[key] = +e.target.value; applySettings(); } }));
    const sel = (label, key, opts) => { const s = h('select', { onchange: e => { st[key] = isNaN(+e.target.value) ? e.target.value : +e.target.value; applySettings(); markDirty(true); } }, ...opts.map(([v, t]) => { const o = h('option', { value: v }, t); if (String(st[key]) === String(v)) o.selected = true; return o; })); return h('label', { class: 'set' }, h('span', {}, label), s); };
    tabBody.append(
      h('div', { class: 'card' },
        slider('Sound effects', 'sfx'), slider('Music', 'music'),
        sel('Number format', 'notation', [['suffix', '1.23M / 4.56Qa'], ['sci', '1.23e6 (scientific)']]),
        sel('Particles', 'particles', [[1, 'High'], [.5, 'Low']]),
        sel('Screen shake', 'shake', [[1, 'On'], [.3, 'Gentle'], [0, 'Off']])),
      h('div', { class: 'card btnrow' },
        h('button', { class: 'btn', onclick: () => { save(); toast('💾', 'Saved', 'Your outage is safe in localStorage.'); } }, 'Save now'),
        h('button', { class: 'btn', onclick: () => modal('Export save', `<textarea readonly class="savebox">${encodeSave()}</textarea><p class="dim">Copy this somewhere safe.</p>`) }, 'Export'),
        h('button', { class: 'btn', onclick: () => modal('Import save', '<textarea class="savebox" id="imp" placeholder="Paste your save here"></textarea>', [{ label: 'Import', cls: 'primary', onclick: () => { try { S = decodeSave($('#imp').value); applySettings(); markDirty(true); resetRunRuntime(); save(); toast('💾', 'Imported', 'Welcome back to prod.'); } catch (e) { toast('⚠️', 'Import failed', 'That is not a valid save.'); return false; } } }, { label: 'Cancel' }]) }, 'Import'),
        h('button', { class: 'btn danger', onclick: () => modal('Hard reset?', '<p class="warn">This deletes <b>everything</b>: hype, crabs, trophies. There is no backup. (This is the one time we test in prod.)</p>', [{ label: 'Delete everything', cls: 'danger', onclick: () => { localStorage.removeItem(SAVE_KEY); S = E.fresh(); applySettings(); markDirty(true); resetRunRuntime(); save(); } }, { label: 'Cancel' }]) }, 'Hard reset')),
      h('div', { class: 'card dim small' }, h('div', { html: 'Keys: <b>1-4</b> cannon mode · <b>Space</b> fire · <b>←/→</b> incident · <b>F</b> farm/auto · <b>B</b> buy amount · <b>M</b> mute' }),
        h('div', { html: 'Built in one HTML canvas, no libraries. No real servers were harmed. They were already like this. · <a href="https://github.com/bryantebeek/slop-cannon" target="_blank">source</a>' })));
  },
};
function agentTip(i) {
  const a = E.AGENTS[i], ups = E.UPGRADES.filter(u => u.kind === 'tier' && u.agent === i);
  return `<b>${a.icon} ${a.name}</b><br><span class="dim">${a.desc}</span><br>Multiplier: x${fmt(D.agentMult[i])}<br>` + ups.map(u => {
    const st = S.upg[u.id] ? ['good', '✓', ''] : S.agents[i] >= u.at ? ['ready', '●', ' — ready in Upgrades'] : ['dim', '·', ''];
    return `<span class="${st[0]}">${st[1]} ${u.at}: ${u.name} (x${u.eff.mult})${st[2]}</span>`;
  }).join('<br>');
}
function upgTip(u) {
  const own = S.upg[u.id];
  return `<b>${u.icon} ${u.name}</b><br>${u.flav}<br>${own ? '<span class="good">Owned ✓</span>' : `<span class="${E.upgCost(S, u) > S.cash ? 'bad' : 'good'}">${money(E.upgCost(S, u))}</span>`}`;
}
function confirmPivot() {
  if (!canPivot()) return;
  const p = E.pendingHype(S);
  modal('🚀 Pivot to AI?', `<p>The investors want a new narrative. You'll <b>lose</b>: downtime $, agents, upgrades, cannon calibre and incident progress.</p>
    <p>You <b>keep</b>: hype, the Board, trophies, postmortems, crabs.</p>
    <p class="good">You gain <b>+${fmt(p)} hype</b> → +${fmt((S.hype + p) * E.hypeEach(S) * 100)}% damage.${E.lv(S.board, 'severance') ? ` You'll restart at incident ${1 + 5 * E.lv(S.board, 'severance')}.` : ''}</p>
    <p class="dim">Root cause of the old company: ${pick(CAUSES)}.</p>`,
    [{ label: `Pivot (+${fmt(p)} 🚀)`, cls: 'primary', onclick: () => doPivot(null) }, { label: 'Not yet' }]);
}
function confirmRust() {
  const c = E.crabsFor(S.eraMax); if (c < 1) return;
  modal('🦀 Rewrite it in Rust?', `<p>Everything goes: the run, <b>all hype</b> and <b>the Board</b>${E.lv(S.rust, 'clippy') ? ` (Clippy keeps ${E.lv(S.rust, 'clippy') * 10}% of Board levels)` : ''}. You keep trophies, postmortems and crabs.</p><p class="good">You gain <b>+${fmt(c)} crabs</b> to spend in the Borrow Checker.</p><p class="dim">Estimated rewrite time: 6 months. Actual: 4 years.</p>`,
    [{ label: `Rewrite (+${fmt(c)} 🦀)`, cls: 'rust', onclick: doRust }, { label: 'Not yet' }]);
}
function showEnding() {
  modal('☁️ us-east-1 is DOWN', `<p>Half the internet is offline. Status pages everywhere still say <i>"All Systems Operational."</i></p>
    <p>Nobody can tell the difference.</p>
    <p class="dim">You took down ${fmt(S.stats.kills)} servers over ${fmtTime(S.stats.played)}, with ${S.pivots} pivots and ${S.rusts} rewrites. Root cause: you.</p>
    <p class="good">Thanks for playing SLOP CANNON. The incidents keep going if you do — servers just get angrier.</p>`, [{ label: 'git push --force (continue)', cls: 'primary' }]);
}
function updateUI() {
  updateTop(); tabsVisibility();
  const k = curTab + '|' + structKey();
  if (structDirty || k !== tabKey) { tabKey = k; buildTab(); }
  tabUpdate();
}

// ───────────── news ticker ─────────────
const tickerEl = $('#tickerText');
function nextNews() {
  const pool = NEWS.filter(n => !n[1] || n[1](S));
  setText(tickerEl, pick(pool)[0]);
  tickerEl.style.animation = 'none'; void tickerEl.offsetWidth;
  const dur = (tickerEl.parentElement.clientWidth + tickerEl.scrollWidth) / 90;
  tickerEl.style.animation = `tick ${dur}s linear`;
}
tickerEl.addEventListener('animationend', nextNews);
$('#ticker').addEventListener('click', () => { G.tickerClick = true; nextNews(); });

// ───────────── input ─────────────
const stage = $('#stage');
function aimFrom(e) { const r = cv.getBoundingClientRect(); aimX = e.clientX - r.left; aimY = e.clientY - r.top; }
cv.addEventListener('mousemove', e => { aimFrom(e); hoverCanvas = true; });
cv.addEventListener('mouseleave', () => { hoverCanvas = false; firing = false; });
cv.addEventListener('mousedown', e => { if (e.button !== 0) return; initAudio(); aimFrom(e); hoverCanvas = true; firing = true; });
addEventListener('mouseup', e => { if (e.button === 0) firing = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); aimFrom(e.touches[0]); hoverCanvas = true; firing = true; }, { passive: false });
cv.addEventListener('touchmove', e => { e.preventDefault(); aimFrom(e.touches[0]); }, { passive: false });
cv.addEventListener('touchend', e => { if (!e.touches.length) { firing = false; hoverCanvas = false; } });
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA']; let kIdx = 0;
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  kIdx = e.code === KONAMI[kIdx] ? kIdx + 1 : e.code === KONAMI[0] ? 1 : 0;
  if (kIdx === KONAMI.length) { G.konami = true; kIdx = 0; toast('🥪', 'Okay.', 'sudo make me a sandwich'); }
  if (e.code === 'Escape' && modalOpen()) return closeModal();
  if (modalOpen()) return;
  if (e.code === 'Space') { e.preventDefault(); initAudio(); if (!hoverCanvas) { aimX = W / 2; aimY = H * .45; hoverCanvas = true; } firing = true; }
  if (/^Digit[1-4]$/.test(e.code)) selectWeapon(+e.code[5] - 1);
  if (e.code === 'ArrowLeft') setLevel(S.level - 1);
  if (e.code === 'ArrowRight') setLevel(S.level + 1);
  if (e.code === 'KeyF') { S.auto = !S.auto; sfx.click(); }
  if (e.code === 'KeyB' && kIdx !== KONAMI.length - 1) { const m = [1, 10, 25, 100, 'max']; buyMode = m[(m.indexOf(buyMode) + 1) % m.length]; updateBuyAmt(); }
  if (e.code === 'KeyM') { VOL.muted = !VOL.muted; G.muted = G.muted || VOL.muted; setVolumes(); toast(VOL.muted ? '🔕' : '🔔', VOL.muted ? 'Muted' : 'Sound on', 'Press M to toggle.'); }
});
addEventListener('keyup', e => { if (e.code === 'Space') firing = false; });
addEventListener('blur', () => { firing = false; });
// No zooming: ctrl/cmd + wheel or +/-/0, pinch (incl. iOS Safari gestures, which ignore user-scalable=no) and double-tap/click.
addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && ['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Digit0', 'Numpad0'].includes(e.code)) e.preventDefault(); });
for (const t of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) document.addEventListener(t, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else applyOffline(); });

// ───────────── offline progress ─────────────
function applyOffline(first) {
  const secs = Math.min(86400, (Date.now() - S.saved) / 1000);
  if (secs < 60) return;
  refresh();
  const gain = incomePerSec() * D.offline * secs;
  S.saved = Date.now();
  if (gain <= 0) return;
  earn(gain); S.stats.offline += gain;
  modal('🏝️ While you were away', `<p>Away for <b>${fmtTime(secs)}</b>. Your agents kept shipping to prod.</p>
    <p class="good big">+${money(gain)}</p>
    <p class="dim">Offline efficiency ${Math.round(D.offline * 100)}%${D.offline < 1 ? ' — hire <b>Remote Work</b> on the Board to raise it' : ''}. Pager alerts ignored: ${fmt(Math.floor(secs / 7))}.</p>`, [{ label: 'Back to breaking prod', cls: 'primary' }]);
}

// ───────────── boot ─────────────
const titleEl = $('#title');
if (hadSave) { $('#titleCta').textContent = '[ CLICK TO RESUME THE OUTAGE ]'; $('#titleSub').textContent = `Incident ${S.level} · ${money(S.cash)} · ${S.pivots ? S.pivots + ' pivots' : 'pre-seed'}`; }
titleEl.addEventListener('click', () => {
  initAudio(); titleEl.classList.add('gone'); setTimeout(() => titleEl.remove(), 600);
  if (hadSave) applyOffline(true);
  else later.push({ t: .5, f: () => toast('🔫', 'Hold the mouse to fire', 'Take down every server. Spend downtime $ on agents in the panel.') });
});
startLevel();
let last = performance.now(), perfT = 0, perfN = 0, uiT = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; T += dt;
  perfT += dt; perfN++;
  if (perfT > 1.5) { if (perfN / perfT < 50 && DPR > 1 && !document.hidden) { maxDPR = Math.max(1, DPR - .5); resize(); } perfT = 0; perfN = 0; }
  // camera follows the crosshair a little, for parallax
  const ty = hoverCanvas ? Math.atan((aimX - W / 2) / F) * .3 : Math.sin(T * .2) * .08, tp = hoverCanvas ? .06 + Math.atan(-(aimY - H / 2) / F) * .22 : .06;
  aimYaw = lerp(aimYaw, ty, Math.min(1, dt * 3)); aimPitch = lerp(aimPitch, clamp(tp, -.15, .3), Math.min(1, dt * 3));
  const vy = (aimYaw - pYaw) / Math.max(dt, 1e-3), vp = (aimPitch - pPitch) / Math.max(dt, 1e-3); pYaw = aimYaw; pPitch = aimPitch;
  swayX = lerp(swayX, clamp(-vy * .03, -.09, .09), Math.min(1, dt * 8)); swayY = lerp(swayY, clamp(-vp * .03, -.06, .06), Math.min(1, dt * 8));
  cam.yaw = aimYaw; cam.pitch = aimPitch + recoil * .02; camUpdate();
  recoil = Math.max(0, recoil - dt * 5); flash = Math.max(0, flash - dt * 14); heat = Math.max(0, heat - dt * .35);
  shake *= Math.exp(-dt * 7); hitMark = Math.max(0, hitMark - dt); redFlash = Math.max(0, redFlash - dt); comboPop = Math.max(0, comboPop - dt * 3);
  sim(dt);
  if (hoverCanvas) aimInfo = raycast([cam.x, cam.y, cam.z], screenRay(aimX, aimY));
  updateParticles(dt);
  render(dt);
  uiT -= dt; if (uiT <= 0) { uiT = .1; updateUI(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
nextNews();

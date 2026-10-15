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
function markDirty() { dirty = true; }
function refresh() { if (dirty) { D = E.derive(S); dirty = false; checkMilestones(); } }
let buffs = [];
const dpsBuff = () => buffs.reduce((m, b) => m * (b.dps || 1), 1);
const shotBuff = () => buffs.reduce((m, b) => m * (b.click || 1), 1);
const goldBuff = () => buffs.reduce((m, b) => m * (b.gold || 1), 1);
const rateBuff = () => buffs.reduce((m, b) => m * (b.rate || 1), 1);
const G = { zuck: 0, combo: 0, comboT: 0, bestCombo: 0, idleT: 0, idleKills: 0, konami: false, tickerClick: false, dropBoss: false, closeCall: false, muted: false, bossFail: false };

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
// Cannon mods are the only purchasable upgrades; they show up once you're within reach of their price.
const modVisible = u => !S.upg[u.id] && (S.runEarned * 4 >= u.cost || S.cash * 4 >= u.cost);
function buyUpg(u, quiet) {
  if (S.upg[u.id]) return false;
  const c = E.upgCost(S, u); if (c > S.cash) { if (!quiet) sfx.deny(); return false; }
  S.cash -= c; S.upg[u.id] = 1; markDirty(true); if (!quiet) sfx.buy();
  if (u.eff.weapon) { if (!quiet) S.weapon = u.eff.weapon; const w = E.WEAPONS[u.eff.weapon]; toast(w.icon, `New cannon mode: ${w.name}`, `Press ${u.eff.weapon + 1} to switch. ${w.sub}.`, w.col); }
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
function autoBuyCannon() {
  for (const u of E.UPGRADES) if (u.kind === 'cannon' && modVisible(u) && E.upgCost(S, u) <= S.cash) { buyUpg(u, true); refresh(); }
  const n = E.cannonMax(S, S.cash * .1); if (n > 0) { S.cash -= E.cannonCost(S, n); S.cannon += n; markDirty(); }
}
// Toast whenever a milestone switches on (agent tiers, synergies, company upgrades).
let msOn = null;
function checkMilestones() {
  const now = new Set(E.milestones(S).map(u => u.id));
  if (msOn) {
    const fresh = [...now].filter(id => !msOn.has(id)).map(id => E.UPG[id]);
    if (fresh.length === 1) { const u = fresh[0]; toast(u.icon, `Milestone: ${u.name}`, u.flav, '#ffffff'); sfx.ach(); }
    else if (fresh.length > 1) { toast('target', `${fresh.length} milestones reached`, fresh.slice(0, 3).map(u => u.name).join(' · ') + (fresh.length > 3 ? ` · +${fresh.length - 3} more` : ''), '#ffffff'); sfx.ach(); }
  }
  msOn = now;
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
  banner(intoChallenge ? `POSTMORTEM: ${E.CHALLENGES.find(c => c.id === intoChallenge).name.toUpperCase()}` : 'PIVOTED TO AI', intoChallenge ? E.CHALLENGES.find(c => c.id === intoChallenge).rule : `+${fmt(h)} hype · investors are thrilled`, '#c77dff');
}
function doRust() {
  const c = E.crabsFor(S.eraMax); if (c < 1) return;
  S.crabs += c; S.crabsEver += c; S.rusts++;
  const keep = .1 * E.lv(S.rust, 'clippy');
  for (const id in S.board) S.board[id] = Math.floor(S.board[id] * keep);
  S.hype = 0; S.hypeClaimed = 0; S.eraEarned = 0; S.eraMax = 1; S.challenge = null;
  E.newRun(S); resetRunRuntime(); markDirty(true); save(); sfx.pivot();
  banner('REWRITTEN IN RUST', `+${fmt(c)} crabs · blazingly fast · memory safe · still down`, '#ff8a3d');
}
function completeChallenge() {
  const c = E.CHALLENGES.find(c => c.id === S.challenge); if (!c) return;
  S.chDone[c.id] = 1; S.challenge = null; markDirty(true); sfx.clear();
  modal('Postmortem complete', `<p><b>${c.name}</b> is now closed as <i>"won't fix"</i>.</p><p class="good">Permanent reward: ${c.reward}</p><p class="dim">Restrictions lifted. Keep going or pivot when you're ready.</p>`, [{ label: 'Blameless.', icon: 'check-circle', cls: 'primary' }], { icon: c.icon, col: '#ff4d6d' });
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
  if (G.zuck > 0) later.push({ t: 1.1, f: () => { if (G.zuck > 0 && !E.isBoss(S.level)) { G.zuck--; zuck(servers.filter(s => !s.dead)); } } });
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
function rollCrit(dmg) { const c = Math.random() < D.crit || buffs.some(b => b.allCrit); return [c ? dmg * D.critMult : dmg, c]; }
function fireCannon() {
  const w = D.weapons[S.weapon] ? S.weapon : 0, WP = E.WEAPONS[w];
  cool = WP.cd / (D.rate * rateBuff());
  const o = [cam.x, cam.y, cam.z], d = screenRay(aimX, aimY), hit = raycast(o, d), m = muzzleWorld();
  const base = shotDmg(WP.mult), n0 = projs.length;
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
  if (buffs.some(b => b.homing) && !hit.gold && !hit.dr) { // MAKE NO MISTAKES: this volley homes in on the aimed (or nearest) server
    const tgt = hit.s || nearestToRay(o, d);
    if (tgt) for (let k = n0; k < projs.length; k++) { projs[k].homing = tgt; projs[k].g = 0; }
  }
  S.stats.shots++; G.idleT = 0;
  recoil = Math.min(1.4, recoil + [.5, .8, 1.3, .7][w]); flash = 1; shake += [.04, .15, .5, .1][w] * QUALITY.shake; heat = Math.min(1, heat + [.05, .15, .35, .12][w]);
  glyphs(m[0], m[1], m[2], '{}();=>', 3, WP.col, 3);
  sfx.fire(w);
}
function fireCron(mult = .5, col = '#7df9ff') {
  const s = liveTarget(); if (!s) return;
  const m = muzzleWorld(), v = ballistic(m, [s.x, s.h * s.sp * .5, s.z - s.d / 2], 80, 12), [dmg, crit] = rollCrit(shotDmg(1) * mult);
  mkProj(m, v, { text: pick(SLOP), dmg, crit, g: 12, col, spr: col === '#7df9ff' ? 'cyan' : null, src: 'cron', size: .65 });
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
  const l = S.level, gold = E.reward(l) * s.rmult * D.gold * goldBuff() * (boss ? D.bossGold : 1) * (1 + .01 * Math.min(G.combo - 1, 50));
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
let goldenT = 40, droneT = 75, goldenQueue = 0, queueT = 0, apT = 0;
// Frontier drops: rare zero-day variants voiced (as parody) by the frontier-lab bosses.
const FRONTIER = [
  { id: 'mythos', name: 'CLAUDE MYTHOS', who: 'Dario Amodei', col: '#e8835a', icon: 'bug-beetle',
    line: 'Mythos found a 17-year-old bug in your prod. Access is restricted to trusted partners. You have 20 seconds.',
    f() { addBuff('mythos', 'CLAUDE MYTHOS', 'Every shot crits', 20, { allCrit: true, icon: 'bug-beetle', col: '#e8835a' }); goldenQueue += 2; return 'every shot crits · 2 more zero-days found'; } },
  { id: 'bel', name: 'HIDDEN ACCESS TO BEL', who: 'Sam Altman', col: '#10a37f', icon: 'lock-key-open',
    line: "Hidden access to Bel granted. It's amazing. Internal only. Please don't tell the board.",
    f() { addBuff('bel', 'BEL (INTERNAL)', 'Agents x20', 15, { dps: 20, icon: 'lock-key-open', col: '#10a37f', then: ['ratelimit', 'RATE LIMITED', 'Agents x0.5 · Bel went back in the vault', 10, { dps: .5, icon: 'hourglass', col: '#ff4d6d' }] }); return 'agents x20 · then rate limited'; } },
  { id: 'zuck', name: 'ZUCK IT', who: 'Mark Zuckerberg', col: '#4f8cff', icon: 'magnet',
    line: "Move fast and break things? I'll just take all of them.",
    f() {
      const boss = servers.find(s => s.type === 'boss' && !s.dead);
      if (boss) { zuck([boss], .25); return 'boss -25% HP'; }
      G.zuck = 4; zuck(servers.filter(s => !s.dead)); return 'this incident + the next 4 vacuumed';
    } },
  { id: 'musk', name: 'FULL SELF-DEPLOYING', who: 'Elon Musk', col: '#cfd6e6', icon: 'car-profile',
    line: 'Full Self-Deploying is here. (Arrives next year.)',
    f() { addBuff('autopilot', 'FULL SELF-DEPLOYING', 'Autopilot · 30 shots/s', 15, { autopilot: 30, icon: 'car-profile', col: '#cfd6e6' }); return 'autopilot · 30 shots/s'; } },
];
// Vacuum servers into the cannon: beams to the muzzle, then they die (frac < 1 = chunk of a boss).
function zuck(list, frac = 1) {
  const m = muzzleWorld();
  for (const s of list) {
    beams.push({ a: [s.x, s.h * s.sp * .5, s.z], b: m, life: .5, max: .5, col: '79,140,255' });
    sparks(s.x, s.h * .5, s.z, 16, 12, '#4f8cff');
    say(s.x, s.h + 1, s.z, 'ZUCKED', '#4f8cff', 1.1, 1.2);
    damage(s, frac < 1 ? s.maxHp * frac : s.hp + 1, 0, 0, 0, 'cascade');
  }
}
function spawnGolden(normal) {
  const sd = Math.random() < .5 ? -1 : 1;
  const fr = !normal && S.maxLevel >= 8 && Math.random() < (1 / 6) * (1 + .1 * E.lv(S.board, 'bounty')) ? pick(FRONTIER) : null;
  golden = { x: -sd * 38, y: rand(8, 14), z: rand(34, 56), vx: sd * rand(5, 6.5), life: 13, age: 0, fr,
    glow: fr ? fr.col : '#ffc93c', label: fr ? `!! FRONTIER DROP · ${fr.name} !!` : '!! 0-DAY · SHOOT IT !!' };
  if (fr) { alert(0, `Frontier drop: ${fr.name} (${fr.who}) — shoot it!`); sfx.goldSpawn(); later.push({ t: .25, f: sfx.goldSpawn }); }
  else { alert(0, `Zero-day disclosed in ${pick(PKGS)} — shoot the golden package!`); sfx.goldSpawn(); }
}
// Regular zero-days: AI-dev X memes. w = weight out of 100; f() applies the effect and returns the subtitle.
const GOLDEN = [
  { w: 14, name: 'FEEL THE AGI', icon: 'brain', col: '#c77dff',
    f() { addBuff('agi', 'FEEL THE AGI', 'Agents x7', 30, { dps: 7, icon: 'brain', col: '#c77dff' }); return 'agents x7 for 30s'; } },
  { w: 13, name: 'LEAKED API KEY', icon: 'key', col: '#ffd23f',
    f() { const g = Math.min(S.cash * .15, incomePerSec() * 900) + 13; earn(g); return `+${money(g)}`; } },
  { w: 8, name: 'TIBO PRESSED THE RESET BUTTON', icon: 'arrows-counter-clockwise', col: '#10a37f',
    f() {
      buffs = buffs.filter(b => !(b.dps < 1)); for (const b of buffs) b.t = b.max; // limits reset: debuffs gone, buffs refilled
      if (E.isBoss(S.level) && phase === 'fight') bossT = bossMax;
      addBuff('limits', 'LIMITS RESET', 'Agents x3', 30, { dps: 3, icon: 'arrows-counter-clockwise', col: '#10a37f' });
      return 'usage limits reset · buffs + boss timer refilled · agents x3';
    } },
  { w: 7, name: "YOU'RE ABSOLUTELY RIGHT!", icon: 'thumbs-up', col: '#e8835a',
    f() { addBuff('right', "YOU'RE ABSOLUTELY RIGHT!", 'Kills pay x3', 20, { gold: 3, icon: 'thumbs-up', col: '#e8835a' }); return 'every kill pays x3 for 20s · great point, by the way'; } },
  { w: 6, name: 'MAKE NO MISTAKES', icon: 'gps-fix', col: '#7df9ff',
    f() { addBuff('nomistakes', 'MAKE NO MISTAKES', 'Shots home in · x50', 15, { click: 50, homing: true, icon: 'gps-fix', col: '#7df9ff' }); return 'shots home in and hit x50 for 15s'; } },
  { w: 5, name: '@GROK IS THIS TRUE?', icon: 'seal-question', col: '#cfd6e6',
    f() {
      const yes = Math.random() < .6, g = incomePerSec() * (yes ? 1800 : 60) + 13; earn(g);
      return yes ? `"Yes." +${money(g)}` : `Readers added context. +${money(g)}`;
    } },
  { w: 5, name: "IT'S SO OVER", icon: 'trend-down', col: '#ff4d6d',
    f() { addBuff('over', "IT'S SO OVER", 'Agents x0.25', 6, { dps: .25, icon: 'trend-down', col: '#ff4d6d', then: ['back', "WE'RE SO BACK", 'Agents x12', 20, { dps: 12, icon: 'trend-up', col: '#5dff9b' }] }); return 'agents x0.25… then WE\'RE SO BACK (x12)'; } },
  { w: 5, name: 'COMPACTING CONVERSATION…', icon: 'arrows-in', col: '#ffb020',
    f() {
      for (const s of servers) if (!s.dead) { say(s.x, s.h + 1, s.z, 'COMPACTED', '#ffb020', 1, 1.2); damage(s, s.maxHp * (s.type === 'boss' ? .15 : .6), 0, 0, 0, 'cascade'); }
      return 'context compacted · every server -60% HP';
    } },
  { w: 3, name: 'HOTFIX', icon: 'first-aid-kit', col: '#5dff9b',
    f() {
      const boss = servers.find(s => s.type === 'boss' && !s.dead);
      if (boss) { damage(boss, boss.maxHp * .1, 0, 0, 0, 'cascade'); return 'boss -10% HP'; }
      for (const s of servers) if (!s.dead) damage(s, s.hp + 1, 0, 0, 0, 'cascade');
      return 'incident auto-resolved';
    } },
  { w: 6, name: 'ULTRATHINK', icon: 'lightbulb-filament', col: '#ffd23f',
    f() { addBuff('ultrathink', 'ULTRATHINK', 'Boss timer frozen · shots x10', 20, { click: 10, freeze: true, icon: 'lightbulb-filament', col: '#ffd23f' }); return 'boss timer frozen · shots x10 for 20s'; } },
  { w: 6, name: 'OUR GPUS ARE MELTING', icon: 'thermometer-hot', col: '#ff8a3d',
    f() { addBuff('melting', 'OUR GPUS ARE MELTING', 'Fire rate x3', 15, { rate: 3, icon: 'thermometer-hot', col: '#ff8a3d' }); return 'fire rate x3 for 15s · temporary limits incoming'; } },
  { w: 5, name: 'FORGET THE CODE EVEN EXISTS', icon: 'headphones', col: '#c77dff',
    f() { addBuff('vibes', 'FULLY GIVE IN TO THE VIBES', 'Hands-free homing vibes', 15, { vibeAuto: 4, icon: 'headphones', col: '#c77dff' }); return 'hands-free homing VIBE CODE barrage for 15s'; } },
  { w: 5, name: '529 OVERLOADED_ERROR', icon: 'warning-octagon', col: '#ff4d6d',
    f() { addBuff('overloaded', '529 OVERLOADED', 'Everything x3', 15, { dps: 3, click: 3, icon: 'warning-octagon', col: '#ff4d6d' }); return 'prod is overloaded too · everything deals x3 for 15s'; } },
  { w: 5, name: '--dangerously-skip-permissions', icon: 'skull', col: '#ff4d6d',
    f() { addBuff('yolo', 'YOLO MODE', 'Agents x15', 10, { dps: 15, icon: 'skull', col: '#ff4d6d' }); if (S.maxLevel >= 10 && !drones.length) spawnDrones(); return 'agents x15 for 10s · the linters noticed'; } },
  { w: 4, name: 'RALPH WIGGUM LOOP', icon: 'repeat', col: '#ffd23f',
    f() { ralphQ.push(...[0, 1, 2].map(() => pick(GOLDEN.filter(g => g.name !== 'RALPH WIGGUM LOOP')))); return '"I\'m helping!" · rolling 3 more zero-days'; } },
  { w: 3, name: 'AGI ACHIEVED INTERNALLY', icon: 'sparkle', col: '#ffffff',
    f() { const g = Math.min(S.cash * .3, incomePerSec() * 3600) + 13; earn(g); return `an hour of downtime, delivered · +${money(g)}`; } },
];
// The Ralph loop replays zero-days one after another (survives incident changes, unlike `later`).
let ralphQ = [], ralphT = 0, vibeT = 0;
function ralphStep() {
  const e = ralphQ.shift(), sub = e.f();
  S.stats.memes = S.stats.memes || {}; S.stats.memes[e.name] = (S.stats.memes[e.name] || 0) + 1;
  toast(e.icon, `RALPH LOOP · ${e.name}`, sub, e.col); alert(0, `Ralph loop: ${e.name} · ${sub}`); sfx.golden();
}
// FORGET THE CODE: one homing VIBE CODE volley at a random live server
function fireVibes() {
  const s = liveTarget(); if (!s) return;
  const m = muzzleWorld(), WP = E.WEAPONS[3];
  for (let i = 0; i < 3; i++) {
    const v = camDir(rand(-1, 1) * .7, rand(.35, .8), .7), [dmg, crit] = rollCrit(shotDmg(WP.mult));
    mkProj(m, [v[0] * 26, v[1] * 26, v[2] * 26], { text: pick(VIBES), dmg, crit, homing: s, g: 0, life: 5, size: .7, col: WP.col, spr: WP.spr, src: 'cron' });
  }
  recoil = Math.min(1.4, recoil + .3); flash = .7;
}
function collectGolden() {
  const g = golden; golden = null; if (!g) return;
  if (g.fr) {
    const fr = g.fr, what = fr.f();
    S.stats.frontier[fr.id] = (S.stats.frontier[fr.id] || 0) + 1; S.stats.golden++;
    sfx.golden(); sfx.ach(); explosion(g.x, g.y, g.z, true); coins(g.x, g.y, g.z, 40); shake += .6 * QUALITY.shake; hitMark = .3;
    banner(fr.name, `${fr.who}: "${fr.line}"`, fr.col);
    toast(fr.icon, `${fr.name} · ${what}`, `${fr.who}: "${fr.line}"`, fr.col);
    say(g.x, g.y + 2, g.z, fr.name, fr.col, 2, 2.4, 1); alert(0, `${fr.name} · ${what}`);
    return;
  }
  let r = Math.random() * 100, eff = GOLDEN[0];
  for (const o of GOLDEN) { if ((r -= o.w) < 0) { eff = o; break; } }
  const sub = eff.f();
  S.stats.golden++; S.stats.memes = S.stats.memes || {}; S.stats.memes[eff.name] = (S.stats.memes[eff.name] || 0) + 1;
  sfx.golden(); explosion(g.x, g.y, g.z, false); coins(g.x, g.y, g.z, 30);
  say(g.x, g.y + 2, g.z, eff.name, eff.col, 2, 2.4, 1); alert(0, `${eff.name} · ${sub}`); hitMark = .3;
  toast(eff.icon, eff.name, sub, eff.col);
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
function resetRunRuntime() { buffs = []; drones = []; golden = null; G.combo = 0; msOn = null; structDirty = true; startLevel(); }
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
    if (!buffs.some(b => b.freeze)) bossT -= dt; if (bossT <= 0) bossEscaped();
  }
  // firing
  cool -= dt;
  if (firing && hoverCanvas && cool <= 0 && !modalOpen()) fireCannon();
  if (D.cron > 0 && phase === 'fight') { cronT -= dt; if (cronT <= 0) { cronT += 1 / D.cron; fireCron(); } }
  const vb = buffs.find(b => b.vibeAuto);
  if (vb && phase === 'fight') { vibeT -= dt; while (vibeT <= 0) { vibeT += 1 / vb.vibeAuto; fireVibes(); } }
  if (buffs.some(b => b.rate)) heat = 1; // GPUs melting: the barrel glows red-hot
  if (ralphQ.length) { ralphT -= dt; if (ralphT <= 0) { ralphT = .9; ralphStep(); } }
  const ap = buffs.find(b => b.autopilot);
  if (ap && phase === 'fight') { apT -= dt; while (apT <= 0) { apT += 1 / ap.autopilot; fireCron(1, '#cfd6e6'); } }
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
      glyphs(p.x, p.y, p.z, '{}[]()', 8, p.col, 6); part({ k: 'flash', x: p.x, y: p.y, z: p.z, life: .15, size: 3, spr: 'yel' });
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
  else if (goldenQueue > 0) { queueT -= dt; if (queueT <= 0) { queueT = 1.2; goldenQueue--; spawnGolden(true); } }
  else if (D.golden > 0 && S.maxLevel >= 3) { goldenT -= dt * D.golden; if (goldenT <= 0) { goldenT = rand(90, 200); spawnGolden(); } }
  // buffs, combo, automation
  for (const b of buffs) b.t -= dt;
  if (buffs.some(b => b.t <= 0)) { const done = buffs.filter(b => b.t <= 0); buffs = buffs.filter(b => b.t > 0); for (const b of done) if (b.then) { addBuff(...b.then); const [, name, desc, , eff] = b.then; toast(eff.icon, name, desc, eff.col); banner(name, desc, eff.col); } markDirty(); }
  G.comboT -= dt; if (G.comboT <= 0) G.combo = 0;
  if (D.hiring) { hireT -= dt; if (hireT <= 0) { hireT = 8 / D.hiring; autoHire(); } }
  if (E.lv(S.rust, 'cargo')) { cargoT -= dt; if (cargoT <= 0) { cargoT = 1.5; autoBuyCannon(); } }
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
    if (ok) { S.ach[a.id] = Date.now(); n++; toast(a.icon, `Trophy: ${a.name}`, `${a.desc} · +3% damage`, '#ffd23f'); }
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

// ───────────── UI: icons & generic pieces ─────────────
// Icons are Phosphor duotone glyphs; data objects carry the icon name (e.g. 'robot').
const IC = (n, cls = '') => `<i class="ph-duotone ph-${n}${cls ? ' ' + cls : ''}"></i>`;
const icon = n => h('i', { class: `ph-duotone ph-${n}` });
const BADGE = (n, c, size = '') => `<span class="ib ${size}" style="--c:${c}">${IC(n)}</span>`;
const badge = (n, c, size = '') => h('span', { class: `ib ${size}`, style: `--c:${c}` }, icon(n));
const COL = { cash: '#ffd23f', hype: '#c77dff', crab: '#ff8a3d', trophy: '#ffd23f', ms: '#ffffff', cannon: '#ffd23f', company: '#7df9ff', post: '#ff4d6d', good: '#5dff9b', info: '#7df9ff', bad: '#ff4d6d', mute: '#9aa6c4' };
const upgCol = u => u.kind === 'tier' ? E.AGENTS[u.agent].col : u.kind === 'syn' ? E.AGENTS[u.a].col : u.kind === 'global' ? COL.company : COL.cannon;
const toastsEl = $('#toasts'), tipEl = $('#tooltip'), modalEl = $('#modal');
function toast(ic, title, body, col = COL.good) {
  const el = h('div', { class: 'toast', style: `--c:${col}` }, badge(ic, col, 'sm'), h('div', {}, h('b', {}, title), h('div', { class: 'd' }, body)), h('i', { class: 'life' }));
  toastsEl.prepend(el); while (toastsEl.children.length > 3) toastsEl.lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 5200);
}
function banner(title, sub, col) {
  const el = $('#banner'); el.innerHTML = ''; el.append(h('div', { class: 'btitle', style: `color:${col || '#fff'}` }, title), h('div', { class: 'bsub' }, sub));
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
const modalOpen = () => !modalEl.hidden;
// buttons: [{ label, icon?, cls?, onclick? }] — onclick returning false keeps the modal open.
function modal(title, html, buttons, o = {}) {
  const col = o.col || COL.hype;
  modalEl.innerHTML = '';
  const card = h('div', { class: 'mcard', style: `--c:${col}` },
    h('div', { class: 'mhead' }, o.icon ? badge(o.icon, col, 'lg') : null, h('h2', {}, title)),
    h('div', { class: 'mbody', html }),
    h('div', { class: 'mbtns' }, ...(buttons || [{ label: 'OK', cls: 'primary' }]).map(b => h('button', { class: 'btn ' + (b.cls || ''), onclick: () => { if (b.onclick && b.onclick() === false) return; closeModal(); } }, b.icon ? icon(b.icon) : null, b.label))));
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
const tipHead = (ic, col, name, sub) => `<div class="tth">${BADGE(ic, col, 'sm')}<div>${name}${sub ? `<small>${sub}</small>` : ''}</div></div>`;

// ───────────── UI: HUD ─────────────
const ui = {
  cash: $('#cash'), income: $('#income'), pills: $('#pills'), lvlStrip: $('#lvlStrip'), lvlInfo: $('#lvlInfo'), boss: $('#bossbar'), bossFill: $('#bossfill'), bossTxt: $('#bosstxt'),
  auto: $('#autoBtn'), chips: $('#chips'), buffs: $('#buffs'), weapons: $('#weapons'), chBanner: $('#chBanner'), mute: $('#muteBtn'),
};
$('#lvlPrev').onclick = () => setLevel(S.level - 1);
$('#lvlNext').onclick = () => setLevel(S.level + 1);
ui.auto.onclick = () => { S.auto = !S.auto; sfx.click(); };
ui.mute.onclick = () => toggleMute();
const panelEl = $('#panel'), collapseBtn = $('#collapseBtn');
function setCollapsed(c) { panelEl.classList.toggle('collapsed', c); collapseBtn.innerHTML = IC(c ? 'caret-up' : 'caret-down'); collapseBtn.title = c ? 'Expand panel' : 'Collapse panel'; }
collapseBtn.onclick = () => { setCollapsed(!panelEl.classList.contains('collapsed')); sfx.click(); };
setCollapsed(false);
function toggleMute() { VOL.muted = !VOL.muted; G.muted = G.muted || VOL.muted; setVolumes(); toast(VOL.muted ? 'speaker-slash' : 'speaker-high', VOL.muted ? 'Muted' : 'Sound on', 'Press M to toggle.', COL.mute); }
const lvlBoxes = [];
for (let i = 0; i < 5; i++) { const b = h('button', { class: 'lvl', onclick: () => setLevel(+b.dataset.l) }); lvlBoxes.push(b); ui.lvlStrip.append(b); }
const weaponBtns = E.WEAPONS.map((w, i) => {
  const b = h('button', { class: 'wpn glass', style: `--c:${w.col}`, onclick: () => selectWeapon(i), tip: () => tipHead(w.icon, w.col, w.name, `key ${i + 1}`) + `${w.sub}<br><span class="dim">x${w.mult} damage per shot · ${(1 / w.cd).toFixed(1)} shots/s</span>` },
    badge(w.icon, w.col), h('span', {}, w.name), h('kbd', {}, i + 1));
  ui.weapons.append(b); return b;
});
function selectWeapon(i) { if (D.weapons[i] && S.weapon !== i) { S.weapon = i; sfx.click(); } }
function updateTop() {
  setText(ui.cash, money(S.cash));
  setHTML(ui.income, `${IC('trend-up')} +${money(incomePerSec())}/s idle`);
  setHTML(ui.pills, `<span class="pill" style="--c:#7df9ff">${IC('lightning')} ${fmt(D.dps * dpsBuff())} DPS</span><span class="pill" style="--c:#ffd23f">${IC('crosshair')} ${fmt(shotDmg(E.WEAPONS[S.weapon].mult))}</span>` +
    (D.cron ? `<span class="pill" style="--c:#c77dff">${IC('timer')} ${D.cron}/s</span>` : ''));
  const l = S.level, start = clamp(l - 2, 1, Math.max(1, S.maxLevel - 3));
  lvlBoxes.forEach((b, i) => {
    const n = start + i; b.dataset.l = n; setHTML(b, n === E.FINAL ? IC('cloud') : String(n));
    b.className = 'lvl' + (n === l ? ' cur' : '') + (E.isBoss(n) ? ' boss' : '') + (n > S.maxLevel ? ' locked' : '') + (n === S.maxLevel && n !== l ? ' frontier' : '');
    b.title = n === E.FINAL ? 'us-east-1' : E.isBoss(n) ? `Boss: ${E.bossName(n)}` : `Incident ${n}`;
  });
  const boss = E.isBoss(l), alive = servers.filter(s => !s.dead).length;
  setHTML(ui.lvlInfo, boss ? `${IC('skull')} BOSS · ${E.bossName(l)}` : `${IC('hard-drives')} INCIDENT ${l} · ${E.PER_LEVEL - alive}/${E.PER_LEVEL} DOWN`);
  ui.lvlInfo.classList.toggle('boss', boss);
  ui.boss.hidden = !(boss && phase === 'fight');
  if (boss) { ui.bossFill.style.transform = `scaleX(${clamp(bossT / bossMax, 0, 1)})`; setText(ui.bossTxt, `${Math.max(0, bossT).toFixed(1)}s`); }
  setHTML(ui.auto, S.auto ? `${IC('fast-forward')} AUTO` : `${IC('arrows-clockwise')} FARMING`); ui.auto.classList.toggle('off', !S.auto);
  let chips = '';
  if (S.hype > 0 || S.pivots) chips += `<span class="chip glass" title="Hype: +${(E.hypeEach(S) * 100).toFixed(0)}% damage each">${BADGE('rocket-launch', COL.hype)}${fmt(S.hype)} <em>+${fmt(S.hype * E.hypeEach(S) * 100)}%</em></span>`;
  if (S.crabsEver > 0) chips += `<span class="chip glass" title="Crabs">${BADGE('shrimp', COL.crab)}${fmt(S.crabs)}</span>`;
  const na = Object.keys(S.ach).length; if (na) chips += `<span class="chip glass" title="Trophies: +3% damage each">${BADGE('trophy', COL.trophy)}${na} <em>+${na * 3}%</em></span>`;
  setHTML(ui.chips, chips);
  setHTML(ui.buffs, buffs.map(b => `<div class="buff" style="--c:${b.col || COL.cash}">${BADGE(b.icon, b.col || COL.cash, 'sm')}<div><b>${b.name}</b>${b.desc} · ${Math.ceil(b.t)}s</div><i class="bar" style="transform:scaleX(${b.t / b.max})"></i></div>`).join(''));
  weaponBtns.forEach((b, i) => { b.hidden = !D.weapons[i]; b.classList.toggle('sel', S.weapon === i); });
  ui.weapons.hidden = D.weapons.filter(Boolean).length < 2;
  setHTML(ui.mute, IC(VOL.muted ? 'speaker-slash' : 'speaker-high'));
  const ch = S.challenge && E.CHALLENGES.find(c => c.id === S.challenge);
  ui.chBanner.hidden = !ch;
  if (ch) setHTML(ui.chBanner, `${BADGE(ch.icon, COL.post, 'sm')}<div><b>POSTMORTEM: ${ch.name}</b><br><span class="dim">${ch.rule} Goal: clear incident ${ch.goal}.</span></div><button class="btn sm danger" id="abandon">${IC('sign-out')} Abandon</button>`);
}
ui.chBanner.addEventListener('click', e => {
  if (e.target.closest('#abandon')) modal('Abandon postmortem?', '<p>This pivots you out of the postmortem without completing it. You still collect pending hype.</p>',
    [{ label: 'Keep going' }, { label: 'Abandon', icon: 'sign-out', cls: 'danger', onclick: () => doPivot(null) }], { icon: 'warning', col: COL.post });
});

// ───────────── UI: side panel ─────────────
const TABS = [
  { id: 'agents', icon: 'robot', col: '#5dff9b', name: 'Agents', show: () => true, sub: () => `${fmt(S.agents.reduce((a, b) => a + b, 0))} agents · ${fmt(D.dps * dpsBuff())} DPS` },
  { id: 'upgrades', icon: 'target', col: '#ffffff', name: 'Milestones', show: () => true, sub: () => `${E.milestones(S).length} / ${E.UPGRADES.filter(u => u.kind !== 'cannon').length} active` },
  { id: 'cannon', icon: 'crosshair', col: '#ffd23f', name: 'Cannon', show: () => true, sub: () => `Calibre ${S.cannon} · ${fmt(shotDmg(E.WEAPONS[S.weapon].mult))} per shot` },
  { id: 'board', icon: 'rocket-launch', col: '#c77dff', name: 'Pivot to AI', short: 'Pivot', show: () => S.pivots > 0 || S.allMax >= 15 || S.rusts > 0, sub: () => `${fmt(S.hype)} hype · ${S.pivots} pivots` },
  { id: 'post', icon: 'clipboard-text', col: '#ff4d6d', name: 'Postmortems', show: () => S.pivots >= E.CHALLENGE_PIVOTS || S.rusts > 0, sub: () => `${Object.keys(S.chDone).length} / ${E.CHALLENGES.length} complete` },
  { id: 'rust', icon: 'gear-six', col: '#ff8a3d', name: 'Rewrite in Rust', short: 'Rust', show: () => S.allMax >= 100 || S.rusts > 0, sub: () => `${fmt(S.crabs)} crabs · ${S.rusts} rewrites` },
  { id: 'trophies', icon: 'trophy', col: '#ffd23f', name: 'Trophies', show: () => true, sub: () => `${Object.keys(S.ach).length} / ${ACHIEVEMENTS.length} · +${Object.keys(S.ach).length * 3}% damage` },
  { id: 'stats', icon: 'chart-bar', col: '#7df9ff', name: 'Stats', show: () => true, sub: () => `${fmtTime(S.stats.played)} played` },
  { id: 'settings', icon: 'gear', col: '#9aa6c4', name: 'Settings', show: () => true, sub: () => 'Audio, display & saves' },
];
let curTab = 'agents';
const tabBody = $('#tabBody'), tabBtns = {}, pIcon = $('#picon');
for (const t of TABS) {
  tabBtns[t.id] = h('button', { class: 'tab', style: `--c:${t.col}`, title: t.name, onclick: () => { curTab = t.id; S.seenUnlocks['tab_' + t.id] = 1; structDirty = true; tabBody.scrollTop = 0; setCollapsed(false); sfx.click(); } },
    icon(t.icon), h('span', { class: 'tn' }, t.short || t.name), h('span', { class: 'new' }, 'NEW'), h('span', { class: 'cnt' }));
  $('#railTabs').append(tabBtns[t.id]);
}
document.querySelectorAll('#buyAmt button').forEach(b => b.onclick = () => { buyMode = b.dataset.n === 'max' ? 'max' : +b.dataset.n; sfx.click(); updateBuyAmt(); });
function updateBuyAmt() { document.querySelectorAll('#buyAmt button').forEach(b => b.classList.toggle('sel', String(buyMode) === b.dataset.n)); }
updateBuyAmt();

let tabUpdate = () => { }, tabKey = '', builtTab = null;
function tabsVisibility() {
  for (const t of TABS) {
    const vis = t.show(), b = tabBtns[t.id];
    if (vis && b.hidden !== false) { b.hidden = false; if (!S.seenUnlocks['tab_' + t.id] && ['board', 'post', 'rust'].includes(t.id)) { b.classList.add('isnew'); toast(t.icon, `Unlocked: ${t.name}`, 'A new tab opened in the side panel.', t.col); } }
    b.hidden = !vis;
    b.classList.toggle('sel', curTab === t.id);
    if (t.id === 'cannon') { const n = E.UPGRADES.filter(u => u.kind === 'cannon' && modVisible(u) && E.upgCost(S, u) <= S.cash).length; setText(b.lastChild, n ? String(n) : ''); b.lastChild.hidden = !n; } else b.lastChild.hidden = true;
    if (S.seenUnlocks['tab_' + t.id]) b.classList.remove('isnew');
  }
  const t = TABS.find(t => t.id === curTab);
  pIcon.style.setProperty('--c', t.col); setHTML(pIcon, IC(t.icon)); setText($('#pname'), t.name); setText($('#psub'), t.sub());
  $('#buyAmt').hidden = !(curTab === 'agents' || curTab === 'cannon');
}
function buildTab() {
  if (builtTab !== curTab) { builtTab = curTab; tabBody.classList.remove('enter'); void tabBody.offsetWidth; tabBody.classList.add('enter'); } // fade in on tab switch only
  tabBody.innerHTML = ''; structDirty = false;
  const t = BUILD[curTab](); tabUpdate = t || (() => { });
}
function structKey() {
  if (curTab === 'agents') return S.agents.map((n, i) => agentVisible(i) ? 1 : 0).join('') + S.challenge;
  if (curTab === 'upgrades') return E.milestones(S).length + '|' + S.agents.map((n, i) => agentVisible(i) ? 1 : 0).join('') + S.challenge;
  if (curTab === 'cannon') return E.UPGRADES.filter(u => u.kind === 'cannon' && (modVisible(u) || S.upg[u.id])).length + '';
  if (curTab === 'board') return S.pivots + '' + S.rusts;
  if (curTab === 'post') return S.challenge + Object.keys(S.chDone).join();
  if (curTab === 'rust') return S.rusts + '';
  if (curTab === 'trophies') return Object.keys(S.ach).length + '';
  return '';
}
// A buy button: kind '' = cash (green), 'hype' (purple), 'rust' (orange).
const costBtn = (label, onclick, kind = '') => h('button', { class: 'buy ' + kind, onclick }, h('span', { class: 'bl' }, label), h('span', { class: 'bc' }));
function setBuy(btn, label, costHTML, ok) { setText(btn.firstChild, label); setHTML(btn.lastChild, costHTML); btn.classList.toggle('no', !ok); }
// A list row: icon badge · name (+ right-aligned slot) · description · extra lines · action.
function row({ col, ic, name, right, desc, extra = [], action, cls = '', tip }) {
  return h('div', { class: 'row ' + cls, style: `--c:${col}`, tip }, badge(ic, col),
    h('div', { class: 'rmain' }, h('div', { class: 'rname' }, h('span', { class: 'n' }, name), right || null), desc ? h('div', { class: 'rdesc' }, desc) : null, ...extra), action || null);
}
const stat = (ic, label, value, col) => `<div class="stat"${col ? ` style="--c:${col}"` : ''}><span>${IC(ic)}${label}</span><b>${value}</b></div>`;
const hint = (ic, text) => h('div', { class: 'hint' }, icon(ic), h('span', {}, text));

const BUILD = {
  agents() {
    const rows = [], list = h('div', { class: 'list' });
    { // the cannon itself is the first "hire" (Clicker Heroes' click hero)
      const own = h('span', { class: 'rcount' }), st = h('div', { class: 'rstat' });
      const btn = costBtn('CALIBRE', () => buyCannon(buyMode === 'max' ? Math.max(1, E.cannonMax(S, S.cash)) : buyMode));
      list.append(row({ col: COL.cannon, ic: 'crosshair', name: 'Slop Cannon (you)', right: own, desc: 'Hold the mouse on prod to fire. Calibre adds base damage.', extra: [st], action: btn, cls: 'accent' }));
      rows.push(() => {
        const n = buyMode === 'max' ? Math.max(1, E.cannonMax(S, S.cash)) : buyMode, c = E.cannonCost(S, n);
        setText(own, 'Lv ' + S.cannon);
        setHTML(st, `${IC('crosshair')} ${fmt(shotDmg(E.WEAPONS[S.weapon].mult))} per shot <span class="sep">·</span> ${IC('gauge')} ${(D.rate / E.WEAPONS[S.weapon].cd).toFixed(1)}/s`);
        setBuy(btn, `+${n} CALIBRE`, money(c), c <= S.cash);
      });
    }
    let teaser = false;
    E.AGENTS.forEach((a, i) => {
      if (!agentVisible(i)) {
        if (teaser) return; teaser = true;
        list.append(row({ col: '#8a86a8', ic: 'lock-simple', name: '??? Classified agent', desc: `Hire ${/^[AEIOU]/.test(E.AGENTS[i - 1].name) ? 'an' : 'a'} ${E.AGENTS[i - 1].name} to reveal · ${money(a.cost)}`, cls: 'locked' }));
        return;
      }
      const own = h('span', { class: 'rcount' }), st = h('div', { class: 'rstat' }), bar = h('i'), mult = h('span', { class: 'mult', tip: () => agentTip(i) }), nextTxt = h('span', { class: 'rnext-t' }), next = h('div', { class: 'rnext' }, mult, nextTxt);
      const btn = costBtn('HIRE', () => buyAgent(i, buyCount(i)));
      list.append(row({ col: a.col, ic: a.icon, name: a.name, right: own, desc: a.desc, extra: [st, h('div', { class: 'prog' }, bar), next], action: btn, cls: 'accent' }));
      rows.push(() => {
        const n = buyCount(i), c = E.agentCost(S, i, n), locked = agentLocked(i), tot = D.dps || 1;
        setText(own, '×' + fmt(S.agents[i]));
        setHTML(st, S.agents[i] ? `${IC('lightning')} ${fmt(D.agentDps[i] / S.agents[i])} each <span class="sep">·</span> ${fmt(D.agentDps[i])} total <span class="sep">·</span> ${D.agentDps[i] / tot < .001 ? '<0.1' : (D.agentDps[i] / tot * 100).toFixed(1)}%`
          : `${IC('lightning')} ${fmt(a.dps * D.agentMult[i] * D.dmg)} DPS each`);
        const nt = E.TIER_AT.find(t => t > S.agents[i]), prev = [0, ...E.TIER_AT].filter(t => t <= S.agents[i]).pop();
        bar.style.transform = `scaleX(${nt ? (S.agents[i] - prev) / (nt - prev) : 1})`;
        const nu = E.UPGRADES.find(u => u.kind === 'tier' && u.agent === i && u.at === nt);
        setHTML(mult, `${IC('target')} x${fmt(D.agentMult[i])}`);
        setHTML(nextTxt, (nu ? `${IC('arrow-right')} <b class="ready">${nu.name}</b> x${nu.eff.mult} <span class="sep">·</span> ${nt - S.agents[i]} to go` : `${IC('check-circle')} all milestones reached`));
        setBuy(btn, locked ? 'LOCKED' : `HIRE ×${n}`, locked ? IC('lock-simple') : money(c), !locked && c <= S.cash);
      });
    });
    tabBody.append(hint('info', 'Agents fire slop at prod on their own. Each hire costs 7% more. Owning 10 · 25 · 50 · 100 · 150 · 200 · 300 of an agent multiplies its damage automatically.'), list);
    return () => rows.forEach(f => f());
  },
  upgrades() {
    const all = E.UPGRADES.filter(u => u.kind !== 'cannon'), on = E.milestones(S);
    if (S.challenge === 'notests') tabBody.append(h('div', { class: 'notice' }, badge('flask', COL.post, 'sm'), 'Postmortem "No Tests": milestones give no bonus this run.'));
    tabBody.append(h('div', { class: 'card summary' }, badge('target', COL.ms, 'lg'), h('div', {}, h('div', { class: 'big' }, `${on.length} / ${all.length}`), h('div', { class: 'dim' }, 'Milestones switch on by themselves — no buying needed. Bright = active.'))));
    tabBody.append(h('div', { class: 'sechead' }, h('span', {}, 'Agent milestones'), h('span', {}, 'owned 10 · 25 · 50 · 100 · 150 · 200 · 300')));
    const list = h('div', { class: 'list wide' });
    E.AGENTS.forEach((a, i) => {
      if (!agentVisible(i)) return;
      const b = badge(a.icon, a.col); b._tip = () => agentTip(i);
      list.append(h('div', { class: 'mrow' }, b, ...E.UPGRADES.filter(u => u.kind === 'tier' && u.agent === i).map(u =>
        h('div', { class: 'tile ms' + (E.reached(S, u) ? ' got' : ''), style: `--c:${a.col}`, tip: () => upgTip(u) }, h('b', { style: 'font:900 12px var(--disp)' }, `x${u.eff.mult}`), h('i', { class: 'tc' }, u.at)))));
    });
    tabBody.append(list);
    const tiles = (kind, label) => h('div', { class: 'grid' }, ...all.filter(u => u.kind === kind).map(u =>
      h('div', { class: 'tile ms' + (E.reached(S, u) ? ' got' : ''), style: `--c:${upgCol(u)}`, tip: () => upgTip(u) }, icon(u.icon), h('i', { class: 'tc' }, label(u)))));
    tabBody.append(h('div', { class: 'sechead' }, h('span', {}, 'Synergies'), h('span', {}, 'own enough of both agents')), tiles('syn', u => `${u.need[0]}+${u.need[1]}`));
    tabBody.append(h('div', { class: 'sechead' }, h('span', {}, 'Company milestones'), h('span', {}, 'reach the incident this run')), tiles('global', u => `#${u.need}`));
  },
  cannon() {
    const lvl = h('div', { class: 'big' }), sub = h('div', { class: 'sub' }), info = h('div', { class: 'statgrid' });
    const btn = costBtn('UPGRADE', () => buyCannon(buyMode === 'max' ? Math.max(1, E.cannonMax(S, S.cash)) : buyMode));
    const hero = h('div', { class: 'card hero', style: `--c:${COL.cannon}` }, h('div', { class: 'top' }, badge('crosshair', COL.cannon, 'xl'), h('div', { style: 'flex:1' }, lvl, sub), btn), h('div', { style: 'height:12px' }), info);
    const list = h('div', { class: 'list' }), rows = [];
    for (const u of E.UPGRADES.filter(u => u.kind === 'cannon')) {
      if (!S.upg[u.id] && !modVisible(u)) continue;
      const b = costBtn('BUY', () => buyUpg(u));
      list.append(row({ col: COL.cannon, ic: u.icon, name: u.name, desc: u.flav, action: S.upg[u.id] ? h('div', { class: 'check' }, icon('check-circle')) : b, cls: S.upg[u.id] ? 'done' : '', tip: () => upgTip(u) }));
      if (!S.upg[u.id]) rows.push(() => { const c = E.upgCost(S, u); setBuy(b, 'BUY', money(c), c <= S.cash); });
    }
    tabBody.append(hint('crosshair', 'Hold the mouse on the battlefield to fire. Shots scale with calibre plus a % of your agent DPS. Shoot golden 0-DAYs and linter drones!'),
      h('div', { class: 'split' }, hero, h('div', {}, h('div', { class: 'sechead' }, h('span', {}, 'Cannon mods'), h('span', {}, 'the only upgrades you buy')), list)));
    return () => {
      const n = buyMode === 'max' ? Math.max(1, E.cannonMax(S, S.cash)) : buyMode, c = E.cannonCost(S, n), WP = E.WEAPONS[S.weapon];
      setHTML(lvl, `Lv ${S.cannon}<small>calibre</small>`); setText(sub, `${fmt(shotDmg(WP.mult))} damage per shot`);
      setBuy(btn, `+${n} CALIBRE`, money(c), c <= S.cash);
      setHTML(info, stat('sword', 'Base damage', fmt(D.shotBase)) + stat('percent', 'Of agent DPS', (D.pct * 100).toFixed(0) + '%') + stat(WP.icon, 'Mode', `${WP.name} x${WP.mult}`, WP.col) + stat('crosshair', 'Shot damage', fmt(shotDmg(WP.mult)), COL.cannon) +
        stat('clover', 'Crit chance', (Math.min(1, D.crit) * 100).toFixed(0) + '%', '#5dff9b') + stat('fire', 'Crit damage', 'x' + fmt(D.critMult), '#ff8a3d') + stat('gauge', 'Fire rate', (D.rate / WP.cd).toFixed(1) + '/s') + stat('timer', 'Cron job', D.cron ? D.cron + ' shots/s' : '—', COL.hype));
      rows.forEach(f => f());
    };
  },
  board() {
    const big = h('div', { class: 'big' }), sub = h('div', { class: 'sub' }), info = h('div', { class: 'info' });
    const pbtn = h('button', { class: 'btn big primary', onclick: confirmPivot }, icon('rocket-launch'), 'PIVOT TO AI');
    const hero = h('div', { class: 'card hero', style: `--c:${COL.hype}` }, h('div', { class: 'top' }, badge('rocket-launch', COL.hype, 'xl'), h('div', {}, big, sub)), info, pbtn);
    const list = h('div', { class: 'list' }), rows = [];
    for (const b of E.BOARD) {
      const lvl = h('span', { class: 'lv' }), desc = h('div', { class: 'rdesc' }), btn = costBtn('PROMOTE', () => {
        const l = E.lv(S.board, b.id), c = E.boardCost(b, l); if (b.max && l >= b.max) return; if (c > S.hype) return sfx.deny();
        S.hype -= c; S.board[b.id] = l + 1; markDirty(true); sfx.buy();
      }, 'hype');
      list.append(row({ col: COL.hype, ic: b.icon, name: b.name, right: lvl, extra: [desc], action: btn }));
      rows.push(() => {
        const l = E.lv(S.board, b.id), c = E.boardCost(b, l), maxed = b.max && l >= b.max;
        setText(lvl, `Lv ${l}${b.max ? ' / ' + b.max : ''}`); setHTML(desc, `${b.desc(l)}${maxed ? '' : ` <span class="dim">· next ${b.next}</span>`}`);
        setBuy(btn, maxed ? 'MAXED' : 'PROMOTE', maxed ? IC('check') : `${IC('rocket-launch')} ${fmt(c)}`, !maxed && c <= S.hype);
      });
    }
    tabBody.append(h('div', { class: 'split' }, hero, h('div', {}, h('div', { class: 'sechead' }, h('span', {}, 'Board of Directors'), h('span', {}, 'spending hype lowers its passive bonus')), list)));
    return () => {
      const p = E.pendingHype(S);
      setHTML(big, `${fmt(S.hype)}<small>hype</small>`); setText(sub, `+${fmt(S.hype * E.hypeEach(S) * 100)}% damage · +${(E.hypeEach(S) * 100).toFixed(0)}% each`);
      setHTML(info, (S.maxLevel >= E.PIVOT_LEVEL ? `Pivoting now grants <b class="good">+${fmt(p)} hype</b>, raising your bonus to <b>+${fmt((S.hype + p) * E.hypeEach(S) * 100)}%</b>.` : `Reach incident <b>${E.PIVOT_LEVEL}</b> this run to pivot <span class="dim">(now ${S.maxLevel})</span>. Pending: <b>+${fmt(p)}</b>.`) +
        `<br><span class="f">hype = (downtime this era ÷ ${E.T.hypeDiv})^${E.T.hypeExp} · pivots: ${S.pivots}</span>`);
      pbtn.disabled = !canPivot(); rows.forEach(f => f());
    };
  },
  post() {
    const list = h('div', { class: 'list' });
    for (const c of E.CHALLENGES) {
      const done = S.chDone[c.id], act = S.challenge === c.id;
      const start = h('button', { class: 'btn sm', onclick: () => modal(`Start "${c.name}"?`, `<p>This <b>pivots</b> you (you still collect pending hype) and restarts at incident 1 with this rule:</p><p class="warn">${c.rule}</p><p>Clear incident <b>${c.goal}</b> to win: <span class="good">${c.reward}</span></p>`, [{ label: 'Cancel' }, { label: 'Start postmortem', icon: 'play', cls: 'primary', onclick: () => doPivot(c.id) }], { icon: c.icon, col: COL.post }) }, icon('play'), 'Start');
      list.append(row({ col: COL.post, ic: c.icon, name: c.name, right: h('span', { class: 'lv' }, `goal #${c.goal}`), desc: c.rule,
        extra: [h('div', { class: 'rstat', html: `${IC('gift')} <span class="good">${c.reward}</span>` })],
        action: done ? h('div', { class: 'check' }, icon('check-circle')) : act ? h('div', { class: 'check act' }, 'ACTIVE') : start, cls: done ? 'done' : act ? 'active' : '' }));
    }
    tabBody.append(hint('clipboard-text', 'Challenge runs with a nasty rule. Complete one for a permanent reward. Your Board and hype still apply.'), list);
  },
  rust() {
    const big = h('div', { class: 'big' }), sub = h('div', { class: 'sub' }), info = h('div', { class: 'info' });
    const rbtn = h('button', { class: 'btn big rust', onclick: confirmRust }, icon('gear-six'), 'REWRITE IT IN RUST');
    const hero = h('div', { class: 'card hero', style: `--c:${COL.crab}` }, h('div', { class: 'top' }, badge('shrimp', COL.crab, 'xl'), h('div', {}, big, sub)), info, rbtn);
    const list = h('div', { class: 'list' }), rows = [];
    for (const r of E.RUST) {
      const lvl = h('span', { class: 'lv' }), desc = h('div', { class: 'rdesc' }), btn = costBtn('CRATE', () => {
        const l = E.lv(S.rust, r.id), c = E.rustCost(r, l); if (r.max && l >= r.max) return; if (c > S.crabs) return sfx.deny();
        S.crabs -= c; S.rust[r.id] = l + 1; markDirty(true); sfx.buy();
      }, 'rust');
      list.append(row({ col: COL.crab, ic: r.icon, name: r.name, right: lvl, extra: [desc], action: btn }));
      rows.push(() => {
        const l = E.lv(S.rust, r.id), c = E.rustCost(r, l), maxed = r.max && l >= r.max;
        setText(lvl, `Lv ${l}${r.max ? ' / ' + r.max : ''}`); setHTML(desc, `${r.desc(l)}${maxed ? '' : ` <span class="dim">· next ${r.next}</span>`}`);
        setBuy(btn, maxed ? 'MAXED' : 'CRATE', maxed ? IC('check') : `${IC('shrimp')} ${fmt(c)}`, !maxed && c <= S.crabs);
      });
    }
    tabBody.append(h('div', { class: 'split' }, hero, h('div', {}, h('div', { class: 'sechead' }, h('span', {}, 'The Borrow Checker'), h('span', {}, 'permanent, survives every reset')), list)));
    return () => {
      const p = E.crabsFor(S.eraMax);
      setHTML(big, `${fmt(S.crabs)}<small>crabs</small>`); setText(sub, `${S.rusts} rewrites · ${fmt(S.crabsEver)} earned`);
      setHTML(info, (S.eraMax >= E.RUST_LEVEL ? `Rewriting now grants <b class="good">+${fmt(p)} crabs</b>.` : `Reach incident <b>${E.RUST_LEVEL}</b> to rewrite <span class="dim">(best this era: ${S.eraMax})</span>.`) +
        `<br><span class="warn">Resets everything a pivot does, plus all hype and your Board.</span><br><span class="f">crabs = 2^((best incident − 110) ÷ 10)</span>`);
      rbtn.disabled = p < 1; rows.forEach(f => f());
    };
  },
  trophies() {
    const n = Object.keys(S.ach).length;
    tabBody.append(h('div', { class: 'card summary' }, badge('trophy', COL.trophy, 'lg'), h('div', {}, h('div', { class: 'big' }, `${n} / ${ACHIEVEMENTS.length}`), h('div', { class: 'dim' }, `Each trophy adds +3% damage · now +${n * 3}%`))),
      h('div', { class: 'grid' }, ...ACHIEVEMENTS.map(a => {
        const got = S.ach[a.id], show = got || !a.secret;
        return h('div', { class: 'tile' + (got ? ' got' : ''), tip: () => show ? tipHead(a.icon, COL.trophy, a.name, got ? 'unlocked · +3% damage' : a.secret ? 'secret' : 'locked') + a.desc : tipHead('question', '#8a86a8', 'Secret trophy', 'locked') + 'Keep breaking things.' }, icon(show ? a.icon : 'question'));
      })));
  },
  stats() {
    const box = h('div', { class: 'statgrid wide' });
    tabBody.append(box);
    return () => setHTML(box, [
      ['coins', 'Downtime this run', money(S.runEarned), COL.cash], ['coins', 'This era', money(S.eraEarned), COL.cash], ['bank', 'All time', money(S.totalEarned), COL.cash], ['trend-up', 'Idle income', money(incomePerSec()) + '/s', COL.good],
      ['hard-drives', 'Current incident', S.level], ['flag', 'Best this run', S.maxLevel], ['crown-simple', 'Best ever', S.allMax, COL.trophy], ['lightning', 'Damage mult', 'x' + fmt(D.dmg)],
      ['timer', 'Run time', fmtTime(S.runTime)], ['clock', 'Time played', fmtTime(S.stats.played)], ['rocket-launch', 'Pivots', S.pivots, COL.hype], ['gear-six', 'Rewrites', S.rusts, COL.crab],
      ['skull', 'Servers down', fmt(S.stats.kills), COL.bad], ['bank', 'Bosses', fmt(S.stats.bosses), COL.bad], ['crosshair', 'Shots fired', fmt(S.stats.shots), COL.cannon], ['clover', 'Crits', fmt(S.stats.crits), COL.good],
      ['coin', 'Zero-days', fmt(S.stats.golden), COL.cash], ['speaker-slash', 'Linters down', fmt(S.stats.drones)], ['link-simple', 'Best combo', G.bestCombo, '#ff8a3d'], ['island', 'Earned offline', money(S.stats.offline), COL.good],
      ['robot', 'Agents owned', fmt(S.agents.reduce((a, b) => a + b, 0)), COL.good], ['target', 'Milestones', E.milestones(S).length, COL.ms],
    ].map(([ic, k, v, c]) => stat(ic, k, v, c)).join(''));
  },
  settings() {
    const st = S.settings;
    const slider = (ic, label, key) => h('label', { class: 'set' }, h('span', {}, icon(ic), label), h('input', { type: 'range', min: 0, max: 1, step: .05, value: st[key], oninput: e => { st[key] = +e.target.value; applySettings(); } }));
    const sel = (ic, label, key, opts) => { const s = h('select', { onchange: e => { st[key] = isNaN(+e.target.value) ? e.target.value : +e.target.value; applySettings(); markDirty(true); } }, ...opts.map(([v, t]) => { const o = h('option', { value: v }, t); if (String(st[key]) === String(v)) o.selected = true; return o; })); return h('label', { class: 'set' }, h('span', {}, icon(ic), label), s); };
    const keys = [['1 – 4', 'Cannon mode'], ['Space', 'Fire at the cursor'], ['← →', 'Previous / next incident'], ['F', 'Farm / auto-advance'], ['B', 'Cycle buy amount'], ['M', 'Mute']];
    tabBody.append(h('div', { class: 'cols' }, h('div', {},
      h('div', { class: 'sechead' }, h('span', {}, 'Audio & display')),
      h('div', { class: 'card' },
        slider('speaker-high', 'Sound effects', 'sfx'), slider('music-notes', 'Music', 'music'),
        sel('hash', 'Number format', 'notation', [['suffix', '1.23M · 4.56Qa'], ['sci', '1.23e6']]),
        sel('sparkle', 'Particles', 'particles', [[1, 'High'], [.5, 'Low']]),
        sel('vibrate', 'Screen shake', 'shake', [[1, 'On'], [.3, 'Gentle'], [0, 'Off']]))), h('div', {},
      h('div', { class: 'sechead' }, h('span', {}, 'Save data'), h('span', {}, 'autosaves every 15s')),
      h('div', { class: 'card btnrow' },
        h('button', { class: 'btn green', onclick: () => { save(); toast('floppy-disk', 'Saved', 'Your outage is safe in localStorage.'); } }, icon('floppy-disk'), 'Save now'),
        h('button', { class: 'btn', onclick: () => modal('Export save', `<textarea readonly class="savebox">${encodeSave()}</textarea><p class="dim">Copy this somewhere safe.</p>`, null, { icon: 'export', col: COL.info }) }, icon('export'), 'Export'),
        h('button', { class: 'btn', onclick: () => modal('Import save', '<textarea class="savebox" id="imp" placeholder="Paste your save here"></textarea>', [{ label: 'Cancel' }, { label: 'Import', icon: 'download-simple', cls: 'primary', onclick: () => { try { S = decodeSave($('#imp').value); applySettings(); markDirty(true); resetRunRuntime(); save(); toast('download-simple', 'Imported', 'Welcome back to prod.'); } catch (e) { toast('warning', 'Import failed', 'That is not a valid save.', COL.bad); return false; } } }], { icon: 'download-simple', col: COL.info }) }, icon('download-simple'), 'Import'),
        h('button', { class: 'btn danger', onclick: () => modal('Hard reset?', '<p class="warn">This deletes <b>everything</b>: hype, crabs, trophies. There is no backup. (This is the one time we test in prod.)</p>', [{ label: 'Cancel' }, { label: 'Delete everything', icon: 'trash', cls: 'danger', onclick: () => { localStorage.removeItem(SAVE_KEY); S = E.fresh(); applySettings(); markDirty(true); resetRunRuntime(); save(); } }], { icon: 'trash', col: COL.bad }) }, icon('trash'), 'Hard reset'))), h('div', {},
      h('div', { class: 'sechead' }, h('span', {}, 'Controls')),
      h('div', { class: 'card keys' }, ...keys.flatMap(([k, d]) => [h('kbd', {}, k), h('span', {}, d)])),
      h('div', { class: 'hint', style: 'margin-top:14px' }, icon('github-logo'), h('span', { html: 'One HTML canvas, no frameworks. Icons by <a href="https://phosphoricons.com" target="_blank">Phosphor</a>. No real servers were harmed — they were already like this. <a href="https://github.com/bryantebeek/slop-cannon" target="_blank">Source</a>' })))));
  },
};
function agentTip(i) {
  const a = E.AGENTS[i], ups = E.UPGRADES.filter(u => u.kind === 'tier' && u.agent === i);
  return tipHead(a.icon, a.col, a.name, `${fmt(S.agents[i])} owned · x${fmt(D.agentMult[i])} multiplier`) + `<div class="dim">${a.desc}</div><div style="margin-top:8px">` + ups.map(u => {
    const got = E.reached(S, u);
    return `<div class="ttl ${got ? 'ready' : 'dim'}">${IC(got ? 'check-circle' : 'lock-simple')} ${u.at} · ${u.name} · x${u.eff.mult}</div>`;
  }).join('') + '</div>';
}
function upgTip(u) {
  const col = upgCol(u);
  if (u.kind === 'cannon') return tipHead(u.icon, col, u.name, 'cannon mod') + `${u.flav}<br>${S.upg[u.id] ? `<span class="good">${IC('check-circle')} Owned</span>` : `<span class="${E.upgCost(S, u) > S.cash ? 'bad' : 'good'}">${IC('coins')} ${money(E.upgCost(S, u))}</span>`}`;
  const got = E.reached(S, u);
  const when = u.kind === 'tier' ? `own ${u.at} ${E.AGENTS[u.agent].name}s (${S.agents[u.agent]}/${u.at})`
    : u.kind === 'syn' ? `own ${u.need[0]} ${E.AGENTS[u.a].name}s and ${u.need[1]} ${E.AGENTS[u.b].name}s`
      : `reach incident ${u.need} this run (best: ${S.maxLevel})`;
  return tipHead(u.icon, col, u.name, 'milestone') + `${u.flav}<br>${got ? `<span class="ready">${IC('check-circle')} Active</span>` : `<span class="dim">${IC('lock-simple')} Unlocks when you ${when}</span>`}`;
}
function confirmPivot() {
  if (!canPivot()) return;
  const p = E.pendingHype(S);
  modal('Pivot to AI?', `<p>The investors want a new narrative. You'll <b>lose</b>: downtime $, agents, cannon calibre and mods, and incident progress.</p>
    <p>You <b>keep</b>: hype, the Board, trophies, postmortems and crabs.</p>
    <p class="good">You gain <b>+${fmt(p)} hype</b> → +${fmt((S.hype + p) * E.hypeEach(S) * 100)}% damage.${E.lv(S.board, 'severance') ? ` You'll restart at incident ${1 + 5 * E.lv(S.board, 'severance')}.` : ''}</p>
    <p class="dim">Root cause of the old company: ${pick(CAUSES)}.</p>`,
    [{ label: 'Not yet' }, { label: `Pivot · +${fmt(p)} hype`, icon: 'rocket-launch', cls: 'primary', onclick: () => doPivot(null) }], { icon: 'rocket-launch', col: COL.hype });
}
function confirmRust() {
  const c = E.crabsFor(S.eraMax); if (c < 1) return;
  modal('Rewrite it in Rust?', `<p>Everything goes: the run, <b>all hype</b> and <b>the Board</b>${E.lv(S.rust, 'clippy') ? ` (Clippy keeps ${E.lv(S.rust, 'clippy') * 10}% of Board levels)` : ''}. You keep trophies, postmortems and crabs.</p><p class="good">You gain <b>+${fmt(c)} crabs</b> to spend in the Borrow Checker.</p><p class="dim">Estimated rewrite time: 6 months. Actual: 4 years.</p>`,
    [{ label: 'Not yet' }, { label: `Rewrite · +${fmt(c)} crabs`, icon: 'gear-six', cls: 'rust', onclick: doRust }], { icon: 'gear-six', col: COL.crab });
}
function showEnding() {
  modal('us-east-1 is DOWN', `<p>Half the internet is offline. Status pages everywhere still say <i>"All Systems Operational."</i></p>
    <p>Nobody can tell the difference.</p>
    <p class="dim">You took down ${fmt(S.stats.kills)} servers over ${fmtTime(S.stats.played)}, with ${S.pivots} pivots and ${S.rusts} rewrites. Root cause: you.</p>
    <p class="good">Thanks for playing SLOP CANNON. The incidents keep going if you do — servers just get angrier.</p>`, [{ label: 'git push --force (continue)', icon: 'git-branch', cls: 'primary' }], { icon: 'cloud-slash', col: COL.info });
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
  if (kIdx === KONAMI.length) { G.konami = true; kIdx = 0; toast('hamburger', 'Okay.', 'sudo make me a sandwich', '#ffd23f'); }
  if (e.code === 'Escape' && modalOpen()) return closeModal();
  if (modalOpen()) return;
  if (e.code === 'Space') { e.preventDefault(); initAudio(); if (!hoverCanvas) { aimX = W / 2; aimY = H * .45; hoverCanvas = true; } firing = true; }
  if (/^Digit[1-4]$/.test(e.code)) selectWeapon(+e.code[5] - 1);
  if (e.code === 'ArrowLeft') setLevel(S.level - 1);
  if (e.code === 'ArrowRight') setLevel(S.level + 1);
  if (e.code === 'KeyF') { S.auto = !S.auto; sfx.click(); }
  if (e.code === 'KeyB' && kIdx !== KONAMI.length - 1) { const m = [1, 10, 25, 100, 'max']; buyMode = m[(m.indexOf(buyMode) + 1) % m.length]; updateBuyAmt(); }
  if (e.code === 'KeyM') toggleMute();
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
  modal('While you were away', `<p>Away for <b>${fmtTime(secs)}</b>. Your agents kept shipping to prod.</p>
    <p class="good big">+${money(gain)}</p>
    <p class="dim">Offline efficiency ${Math.round(D.offline * 100)}%${D.offline < 1 ? ' — hire <b>Remote Work</b> on the Board to raise it' : ''}. Pager alerts ignored: ${fmt(Math.floor(secs / 7))}.</p>`, [{ label: 'Back to breaking prod', icon: 'play', cls: 'primary' }], { icon: 'island', col: '#5dff9b' });
}

// ───────────── boot ─────────────
const titleEl = $('#title');
if (hadSave) { $('#titleCta').textContent = '[ CLICK TO RESUME THE OUTAGE ]'; $('#titleSub').textContent = `Incident ${S.level} · ${money(S.cash)} · ${S.pivots ? S.pivots + ' pivots' : 'pre-seed'}`; }
titleEl.addEventListener('click', () => {
  initAudio(); titleEl.classList.add('gone'); setTimeout(() => titleEl.remove(), 600);
  if (hadSave) applyOffline(true);
  else later.push({ t: .5, f: () => toast('crosshair', 'Hold the mouse to fire', 'Take down every server. Spend downtime $ on agents in the panel.', '#ffd23f') });
});
startLevel();
let last = performance.now(), perfT = 0, perfN = 0, uiT = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; T += dt;
  perfT += dt; perfN++;
  if (perfT > 1.5) { if (perfN / perfT < 50 && DPR > 1 && !document.hidden) { maxDPR = Math.max(1, DPR - .5); resize(); } perfT = 0; perfN = 0; }
  // camera follows the crosshair a little, for parallax
  const ty = hoverCanvas ? Math.atan((aimX - W / 2) / F) * .4 : Math.sin(T * .2) * .08, tp = hoverCanvas ? .06 + Math.atan(-(aimY - H / 2) / F) * .3 : .06;
  aimYaw = lerp(aimYaw, ty, Math.min(1, dt * 3)); aimPitch = lerp(aimPitch, clamp(tp, -.15, .35), Math.min(1, dt * 3));
  const vy = (aimYaw - pYaw) / Math.max(dt, 1e-3), vp = (aimPitch - pPitch) / Math.max(dt, 1e-3); pYaw = aimYaw; pPitch = aimPitch;
  swayX = lerp(swayX, clamp(-vy * .03, -.09, .09), Math.min(1, dt * 8)); swayY = lerp(swayY, clamp(-vp * .03, -.06, .06), Math.min(1, dt * 8));
  cam.yaw = aimYaw; cam.pitch = aimPitch + recoil * .02; camUpdate();
  recoil = Math.max(0, recoil - dt * 5); flash = Math.max(0, flash - dt * 14); heat = Math.max(0, heat - dt * .35);
  shake *= Math.exp(-dt * 7); hitMark = Math.max(0, hitMark - dt); redFlash = Math.max(0, redFlash - dt); comboPop = Math.max(0, comboPop - dt * 3);
  sim(dt);
  if (hoverCanvas) aimInfo = raycast([cam.x, cam.y, cam.z], screenRay(aimX, aimY));
  updateBarrel(dt);
  updateParticles(dt);
  render(dt);
  uiT -= dt; if (uiT <= 0) { uiT = .1; updateUI(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
nextNews();

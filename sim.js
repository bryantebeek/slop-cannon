// Headless balance check: a greedy player buys the best DPS-per-$ option, advances while it can,
// pivots when stuck, and we print the pacing. Run: node sim.js [active|idle]
'use strict';
const E = require('./econ.js');
const active = process.argv[2] !== 'idle';
const PIV = +(process.env.piv || E.PIVOT_LEVEL);
const S = E.fresh();
let t = 0, log = [], nextMark = [10, 25, 40, 60, 80, 100, 120, 140, 160, 180, 200], firstPivot = null;

function eff(S) {
  const D = E.derive(S);
  const shots = active || !S.agents[0] ? 6 * D.rate : D.cron * .5; // the idle player clicks only until the first hire
  const crit = 1 + Math.min(1, D.crit) * (D.critMult - 1);
  return D.dps + shots * E.shotDamage(D) * crit;
}
function gain(S, mut, undo) { const before = eff(S); mut(S); const g = eff(S) - before; undo(S); return g; }
function buy(S) {
  for (let guard = 0; guard < 400; guard++) {
    let best = null;
    const consider = (cost, mut, undo) => { if (!(cost > 0) || cost > S.cash * 50) return; const g = gain(S, mut, undo); const r = g / cost; if (g > 0 && (!best || r > best.r)) best = { r, cost, mut }; };
    E.AGENTS.forEach((a, i) => { if (S.challenge === 'legacy4' && i >= 4) return; if (i === 0 || S.agents[i - 1] > 0 || S.cash > a.cost) consider(E.agentCost(S, i), c => c.agents[i]++, c => c.agents[i]--); });
    for (const u of E.UPGRADES) { // only cannon mods are bought; milestones switch on by themselves
      if (u.kind !== 'cannon' || S.upg[u.id]) continue;
      consider(E.upgCost(S, u), c => { c.upg[u.id] = 1; }, c => { delete c.upg[u.id]; });
    }
    consider(E.cannonCost(S), c => c.cannon++, c => c.cannon--);
    if (!best || best.cost > S.cash) return;
    S.cash -= best.cost; best.mut(S);
  }
}
function earn(S, x) { S.cash += x; S.runEarned += x; S.eraEarned += x; S.totalEarned += x; }
function pivot(S) {
  const h = E.pendingHype(S); S.hype += h; S.hypeClaimed += h; S.pivots++;
  E.newRun(S);
  // run the easiest open postmortem we've comfortably outgrown (the game restarts those at incident 1)
  const ch = S.pivots >= E.CHALLENGE_PIVOTS && E.CHALLENGES.filter(c => !S.chDone[c.id] && c.goal < S.eraMax * .7).sort((a, b) => a.goal - b.goal)[0];
  if (ch) { S.challenge = ch.id; S.level = S.maxLevel = 1; log.push(`    postmortem ${ch.name}`); }
}
function rust(S) {
  const c = E.crabsFor(S.eraMax); S.crabs += c; S.crabsEver += c; S.rusts++;
  S.hype = S.hypeClaimed = S.eraEarned = 0; S.eraMax = 1; S.challenge = null; E.newRun(S);
  for (;;) { // spend crabs on the cheaper of damage and hype gain
    const r = ['safety', 'fearless'].map(id => E.RUST.find(r => r.id === id)).map(r => ({ r, c: E.rustCost(r, E.lv(S.rust, r.id)) })).sort((a, b) => a.c - b.c)[0];
    if (r.c > S.crabs) break; S.crabs -= r.c; S.rust[r.r.id] = E.lv(S.rust, r.r.id) + 1;
  }
}
let stuckFor = 0, runStart = 0;
const HOURS = +(process.argv[3] || 40);
while (t < 3600 * HOURS && S.maxLevel <= E.FINAL) {
  buy(S);
  const D = E.derive(S), e = eff(S), l = S.level;
  const D2 = E.derive(S), g = D2.gold;
  if (E.isBoss(l)) {
    const need = E.hp(l) / D.bossTime;
    if (e >= need) { const tt = E.hp(l) / e + 2; t += tt; earn(S, E.reward(l) * g * D.bossGold); S.level++; stuckFor = 0; }
    else { // farm previous level for 30s
      const fl = l - 1, per = Math.max(E.hp(fl) / e, .12) + .15; t += 30; earn(S, 30 / per * E.reward(fl) * g); stuckFor += 30;
    }
  } else {
    const per = Math.max(E.hp(l) / e, .12) + .15, tt = per * E.PER_LEVEL + 1.5;
    t += tt; earn(S, E.PER_LEVEL * E.reward(l) * g); S.level++;
    if (tt > 90) stuckFor += tt; else stuckFor = 0;
  }
  S.maxLevel = Math.max(S.maxLevel, S.level - 1); S.eraMax = Math.max(S.eraMax, S.maxLevel);
  const ch = S.challenge && E.CHALLENGES.find(c => c.id === S.challenge);
  if (ch && S.maxLevel > ch.goal) { S.chDone[ch.id] = 1; S.challenge = null; log.push(`    done ${ch.name} at ${(t / 60).toFixed(1)} min`); }
  while (nextMark.length && S.maxLevel >= nextMark[0]) { log.push(`lvl ${nextMark[0]} @ ${(t / 60).toFixed(1)} min (pivots ${S.pivots}, hype ${S.hype})`); nextMark.shift(); }
  const ph = E.pendingHype(S), crabs = E.crabsFor(S.eraMax);
  if (stuckFor > 120 && crabs >= Math.max(2, S.crabsEver)) {
    log.push(`  RUST #${S.rusts + 1} at ${(t / 60).toFixed(1)} min, era best ${S.eraMax}, +${crabs} crabs`);
    rust(S); stuckFor = 0; runStart = t; continue;
  }
  if (ch && stuckFor > 600) { log.push(`    gave up on ${ch.name}`); pivot(S); stuckFor = 0; runStart = t; continue; }
  if (S.maxLevel >= PIV && stuckFor > 120 && ph > Math.max(3, S.hype * (+process.env.pr || .5))) {
    if (!firstPivot) firstPivot = t;
    log.push(`  pivot #${S.pivots + 1} at ${(t / 60).toFixed(1)} min, reached ${S.maxLevel}, run ${((t - runStart) / 60).toFixed(1)} min, +${ph} hype`);
    pivot(S); stuckFor = 0; runStart = t;
  }
}
console.log((active ? 'ACTIVE' : 'IDLE') + ' player');
console.log(log.join('\n'));
console.log(`end: t=${(t / 3600).toFixed(1)}h level ${S.maxLevel} hype ${S.hype}`);

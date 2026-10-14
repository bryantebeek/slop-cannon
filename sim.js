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
  const shots = active ? 6 * D.rate : D.cron * .5;
  const crit = 1 + Math.min(1, D.crit) * (D.critMult - 1);
  return D.dps + shots * E.shotDamage(D) * crit;
}
function gain(S, mut, undo) { const before = eff(S); mut(S); const g = eff(S) - before; undo(S); return g; }
function buy(S) {
  for (let guard = 0; guard < 400; guard++) {
    let best = null;
    const consider = (cost, mut, undo) => { if (!(cost > 0) || cost > S.cash * 50) return; const g = gain(S, mut, undo); const r = g / cost; if (g > 0 && (!best || r > best.r)) best = { r, cost, mut }; };
    E.AGENTS.forEach((a, i) => { if (S.challenge === 'legacy4' && i >= 4) return; if (i === 0 || S.agents[i - 1] > 0 || S.cash > a.cost) consider(E.agentCost(S, i), c => c.agents[i]++, c => c.agents[i]--); });
    if (S.challenge !== 'notests') for (const u of E.UPGRADES) {
      if (S.upg[u.id]) continue;
      if (u.kind === 'tier' && S.agents[u.agent] < u.at) continue;
      if (u.kind === 'syn' && (S.agents[u.a] < u.need[0] || S.agents[u.b] < u.need[1])) continue;
      if (u.need && u.kind === 'global' && S.maxLevel < u.need) continue;
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
  S.maxLevel = Math.max(S.maxLevel, S.level - 1);
  while (nextMark.length && S.maxLevel >= nextMark[0]) { log.push(`lvl ${nextMark[0]} @ ${(t / 60).toFixed(1)} min (pivots ${S.pivots}, hype ${S.hype})`); nextMark.shift(); }
  const ph = E.pendingHype(S);
  if (S.maxLevel >= PIV && stuckFor > 120 && ph > Math.max(3, S.hype * (+process.env.pr || .5))) {
    if (!firstPivot) firstPivot = t;
    log.push(`  pivot #${S.pivots + 1} at ${(t / 60).toFixed(1)} min, reached ${S.maxLevel}, run ${((t - runStart) / 60).toFixed(1)} min, +${ph} hype`);
    pivot(S); stuckFor = 0; runStart = t;
  }
}
console.log((active ? 'ACTIVE' : 'IDLE') + ' player');
console.log(log.join('\n'));
console.log(`end: t=${(t / 3600).toFixed(1)}h level ${S.maxLevel} hype ${S.hype}`);

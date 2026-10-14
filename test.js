// Multiplier self-check: every damage/gold/cost source must move derive() by exactly its advertised amount.
// Run: node test.js
'use strict';
const E = require('./econ.js');
const assert = require('assert');
const near = (a, b, msg) => assert(Math.abs(a / b - 1) < 1e-9, `${msg}: got ${a}, expected ${b}`);
const base = () => { const S = E.fresh(); S.agents = S.agents.map(() => 10); S.cannon = 10; return S; };
const ratio = (key, mut, get = D => D[key]) => { const S = base(), a = get(E.derive(S)); mut(S); return get(E.derive(S)) / a; };
let n = 0;
const check = (name, got, want) => { near(got, want, name); n++; };

// milestones switch on by themselves: agent tiers at N owned, synergies at both counts, company upgrades at an incident
const multAt = (i, n) => { const S = E.fresh(); S.agents[i] = n; return E.derive(S).agentMult[i]; };
for (const u of E.UPGRADES.filter(u => u.kind === 'tier'))
  check(`tier ${u.id} switches on at ${u.at}`, multAt(u.agent, u.at) / multAt(u.agent, u.at - 1), u.eff.mult);
for (const u of E.UPGRADES.filter(u => u.kind === 'syn')) {
  const S = E.fresh(); S.agents[u.a] = u.need[0]; S.agents[u.b] = u.need[1] - 1; const off = E.derive(S).agentMult[u.a];
  S.agents[u.b] = u.need[1]; check(`synergy ${u.id}`, E.derive(S).agentMult[u.a] / off, 1 + u.eff.syn.pct * u.need[1]);
}
const atLevel = (key, u) => { const S = base(); S.maxLevel = u.need - 1; const a = E.derive(S)[key]; S.maxLevel = u.need; return E.derive(S)[key] / a; };
for (const u of E.UPGRADES.filter(u => u.eff.global)) check(`company ${u.id} at incident ${u.need}`, atLevel('dps', u), u.eff.global);
for (const u of E.UPGRADES.filter(u => u.eff.gold)) check(`company gold ${u.id}`, atLevel('gold', u), u.eff.gold);
{ const S = base(); S.agents[0] = 300; S.challenge = 'notests'; check('No Tests: milestones off', E.derive(S).agentMult[0], 1); }
for (const u of E.UPGRADES.filter(u => u.eff.rate)) check(`rate ${u.id}`, ratio('rate', S => { S.upg[u.id] = 1; }), u.eff.rate);
{ const S = base(), ups = E.UPGRADES.filter(u => u.eff.pct); ups.forEach(u => S.upg[u.id] = 1); check('shot %-of-DPS upgrades add up', E.derive(S).pct, ups.reduce((a, u) => a + u.eff.pct, 0)); }

// shots really include the %-of-DPS part
{ const S = base(); S.upg.c_kb = 1; const D = E.derive(S); check('shot = base + 1% dps', E.shotDamage(D), D.shotBase + .01 * D.dps); check('shot with x7 frenzy', E.shotDamage(D, 7), D.shotBase + .07 * D.dps); }

// prestige & meta sources apply to agents AND the cannon
const both = (name, mut, want) => { check(`${name} (agents)`, ratio('dps', mut), want); check(`${name} (cannon)`, ratio('shotBase', mut), want); };
both('10 hype', S => { S.hype = 10; }, 2);
both('5 trophies', S => { ['a', 'b', 'c', 'd', 'e'].forEach(k => S.ach[k] = 1); }, 1.15);
both('Memory Safety x2', S => { S.rust.safety = 2; }, 9);
both('Self-Healing reward', S => { S.chDone.k8s = 1; }, 5);
check('air-gapped: 12% per hype', ratio('dps', S => { S.hype = 10; S.chDone.airgap = 1; }), 2.2);
check('Series A x3 (agents only)', ratio('dps', S => { S.board.seriesA = 3; }), 1.75);
check('Series A leaves cannon base', ratio('shotBase', S => { S.board.seriesA = 3; }), 1);
check('Growth Hacker x2', ratio('gold', S => { S.board.growth = 2; }), 1.4);
check('Legacy Code x2', ratio('bossGold', S => { S.board.legacy = 2; }), 2);
check('Friday reward', ratio('bossGold', S => { S.chDone.friday = 1; }), 3);
check('Bug Bounty x2 zero-days', ratio('golden', S => { S.board.bounty = 2; }), 1.3);
check('unsafe {} x2 crit', ratio('critMult', S => { S.rust.unsafe = 2; }), 4);
check('Blame Game crit', ratio('critMult', S => { S.upg.c_blame = 1; }), 2);
check('Legacy Only reward', ratio(null, S => { S.chDone.legacy4 = 1; }, D => D.agentDps[0]), 100);
check('Monorepo reward', ratio('dps', S => { S.chDone.monorepo = 1; }), 10);
check('Code Freeze: agents off', ratio('dps', S => { S.challenge = 'freeze'; }) + 1, 1);
{ const S = E.fresh(); S.eraEarned = 1e12; const raw = Math.pow(1e12 / E.T.hypeDiv, E.T.hypeExp); S.board.insider = 5; check('Insider Trading +50% hype', E.hypeTotal(S), Math.floor(raw * 1.5)); S.board.insider = 0; S.rust.fearless = 2; check('Fearless Concurrency x4 hype', E.hypeTotal(S), Math.floor(raw * 4)); }
{ const S = base(), c = E.agentCost(S, 3); S.board.debt = 4; check('Technical Debt', E.agentCost(S, 3) / c, Math.pow(.97, 4)); S.board.debt = 0; S.rust.zerocost = 1; check('Zero-Cost Abstractions', E.agentCost(S, 3) / c, .5); }
check('No Tests reward', ratio('dps', S => { S.chDone.notests = 1; }), 3);
console.log(`✓ ${n} multiplier checks passed`);

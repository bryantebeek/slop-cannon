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

// per-agent tier upgrades, synergies, globals
for (const u of E.UPGRADES.filter(u => u.kind === 'tier'))
  check(`tier ${u.id}`, ratio(null, S => { S.upg[u.id] = 1; }, D => D.agentDps[u.agent]), u.eff.mult);
for (const u of E.UPGRADES.filter(u => u.kind === 'syn'))
  check(`synergy ${u.id}`, ratio(null, S => { S.upg[u.id] = 1; }, D => D.agentDps[u.a]), 1 + u.eff.syn.pct * 10);
for (const u of E.UPGRADES.filter(u => u.eff.global)) check(`global ${u.id}`, ratio('dps', S => { S.upg[u.id] = 1; }), u.eff.global);
for (const u of E.UPGRADES.filter(u => u.eff.gold)) check(`gold ${u.id}`, ratio('gold', S => { S.upg[u.id] = 1; }), u.eff.gold);
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
{ const S = base(), c = E.upgCost(S, E.UPG.t0_0); S.chDone.notests = 1; check('No Tests reward', E.upgCost(S, E.UPG.t0_0) / c, .5); }
console.log(`✓ ${n} multiplier checks passed`);

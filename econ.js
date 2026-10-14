// SLOP CANNON — economy: content, formulas and derived stats.
// Pure (no DOM), so `node sim.js` can balance it headlessly.
'use strict';
const ECON = (() => {
  // Balance knobs, tuned with sim.js (override any of them with SLOP_<knob>=value node sim.js).
  //  eff: DPS elasticity of the agent ladder · hpG/hpG2/knee: server HP growth per incident
  //  rewN/rewB: HP per $ (normal/boss) · hypeDiv/hypeExp: hype = (era earnings / div)^exp (Egg, Inc. uses ~0.14)
  const T = { eff: .8, hpG: 1.55, hpG2: 1.65, knee: 100, rewN: 5, rewB: 2, hypeDiv: 40, hypeExp: .16 };
  if (typeof process !== 'undefined' && process.env) for (const k in T) if (process.env['SLOP_' + k]) T[k] = +process.env['SLOP_' + k];
  // ───────────── agents (generators) ─────────────
  // Costs/DPS follow Clicker Heroes' hero table: each tier is ~5x pricier and less cost-efficient,
  // so cheap agents stay relevant through their x2/x3 tier upgrades.
  const AGENTS = [
    { id: 'intern', icon: '🧑‍🎓', name: 'Intern', desc: 'Copy-pastes from Stack Overflow. Unpaid. Unsupervised.', cost: 50, dps: 5, col: '#5dff9b',
      lines: ['copy(paste)', '// from StackOverflow', 'console.log("here")', 'git commit -m "fix"', '// TODO: ask senior'] },
    { id: 'auto', icon: '⌨️', name: 'Autocomplete', desc: 'Presses Tab so you don\'t have to read.', cost: 300, dps: 24.6, col: '#7df9ff',
      lines: ['as any', '// @ts-ignore', 'catch(e){}', '!important', 'any[]'] },
    { id: 'junior', icon: '🐣', name: 'Junior + ChatGPT', desc: 'Ships fast. Asks nothing. Understands less.', cost: 2000, dps: 134, col: '#ffd23f',
      lines: ['eval(input)', 'password123', '== null', 'sleep(5000)', 'md5(pw)'] },
    { id: 'prompt', icon: '🪄', name: 'Prompt Engineer', desc: '"You are a senior engineer. Do not make mistakes."', cost: 15000, dps: 827, col: '#ff9ef5',
      lines: ['prompt: fix it', 'make it pop', 'pls no bugs', 'think step by step', 'you are a 10x dev'] },
    { id: 'vibe', icon: '✨', name: 'Vibe Coder', desc: 'Has never opened the diff. Has never needed to.', cost: 150000, dps: 6780, col: '#c77dff',
      lines: ['✨ vibes', 'trust me bro', 'just works™', '// works on my machine', 'LGTM 👍'] },
    { id: 'copilot', icon: '🐝', name: 'Copilot Swarm', desc: 'Forty autocompletes arguing in a trench coat.', cost: 2e06, dps: 74100, col: '#7df9ff',
      lines: ['import *', 'while(true)', 'retry(∞)', 'except: pass', 'SELECT * FROM *'] },
    { id: 'agent', icon: '🤖', name: 'Autonomous Agent', desc: 'Runs with --dangerously-skip-permissions. "I panicked."', cost: 4e07, dps: 1.22e06, col: '#ff4d6d',
      lines: ['rm -rf /', 'git push -f', 'chmod 777', 'DROP DATABASE prod;', 'curl | sudo sh'] },
    { id: 'tenx', icon: '🦸', name: '10x Engineer', desc: 'Ten agents in a hoodie. Refuses code review on principle.', cost: 1e09, dps: 2.49e07, col: '#ffb020',
      lines: ['O(n³)', 'v2_final_FINAL', 'goto fail', 'unsafe {}', '#define TRUE 0'] },
    { id: 'consult', icon: '🧾', name: 'AI Consultancy', desc: 'Bills by the token. Delivers a 400-slide deck.', cost: 4e10, dps: 8.18e08, col: '#9aa6c4',
      lines: ['invoice.pdf', 'phase 2', 'synergy', 'scope creep', 'per diem'] },
    { id: 'halluc', icon: '🍄', name: 'Hallucination Engine', desc: 'Invents packages. Someone else publishes them.', cost: 2.5e12, dps: 4.19e10, col: '#5dff9b',
      lines: ["import 'react-ai-pro'", 'npm i is-even-ai', 'cite: trust me', 'api.v7.fake()', 'left-pad@99'] },
    { id: 'startup', icon: '🦄', name: 'Self-Replicating Startup', desc: 'Raises a seed round, forks itself, raises again.', cost: 2e14, dps: 2.75e12, col: '#ff8ad8',
      lines: ['raise(seed)', 'pivot()', 'fork()', 'web3', 'AI-first'] },
    { id: 'paperclip', icon: '📎', name: 'Paperclip Maximizer', desc: 'Converts your infrastructure into paperclips. Efficiently.', cost: 2.5e16, dps: 2.82e14, col: '#cfd8ff',
      lines: ['📎', '📎📎📎', 'maximize()', 'clips++', 'convert(earth)'] },
    { id: 'agi', icon: '🧠', name: 'AGI (4 if-statements)', desc: 'Achieved general intelligence. It is mostly else-ifs.', cost: 4e18, dps: 3.7e16, col: '#ffd23f',
      lines: ['if (sentient)', 'else if', 'return true', 'hello, human', '// do not remove'] },
    { id: 'singularity', icon: '🌀', name: 'The Singularity', desc: 'Improves itself. Mostly its own LinkedIn.', cost: 8e20, dps: 6.06e18, col: '#c77dff',
      lines: ['∞', 'self.improve()', 'Ω', 'recurse()', 'Σ'] },
    { id: 'dyson', icon: '☀️', name: 'Dyson GPU Sphere', desc: 'Wraps the sun in H100s. Still CUDA out of memory.', cost: 2e23, dps: 1.24e21, col: '#ff8a3d',
      lines: ['CUDA OOM', '☀ → FLOPS', 'NaN loss', 'H100 × 10⁹', 'tensor<∞>'] },
    { id: 'admin', icon: '👁️', name: 'Simulation Admin', desc: 'Has sudo on reality. Deploys straight to it.', cost: 6e25, dps: 3.06e23, col: '#ffffff',
      lines: ['sudo reality', 'patch(physics)', '> /dev/null', 'reboot()', 'rm -rf universe'] },
  ];
  // DPS of each agent = previous DPS x (cost ratio)^EFF: newer agents are less cost-efficient, so a
  // bigger wallet buys less-than-proportional damage and progress walls up between prestiges.
  for (let i = 1; i < AGENTS.length; i++) AGENTS[i].dps = AGENTS[i - 1].dps * Math.pow(AGENTS[i].cost / AGENTS[i - 1].cost, T.eff);
  const GROWTH = 1.07;

  // Per-agent tier upgrades: unlocked at an owned count, cost is a multiple of the agent's base cost.
  const TIER_AT = [10, 25, 50, 100, 150, 200, 300];
  const TIER_K = [20, 80, 600, 2e4, 6e5, 2e7, 4e10];
  const TIER_M = [2, 2, 2, 2, 2, 3, 3];
  const TIER_NAMES = {
    intern: ['Free Pizza', 'Return Offer', 'Read the Docs (once)', 'Senior Title (No Raise)', 'Stack Overflow Premium', 'Tribal Knowledge', 'Tenure'],
    auto: ['Tab Tab Tab', 'Accept All', 'Multi-line Suggestions', 'Context Window', 'Accept While Sleeping', 'Predictive Merge', 'Autocomplete the Autocomplete'],
    junior: ['GPT-Plus Seat', 'Rubber Duck (Unused)', 'Bootcamp Certificate', 'Promoted to Mid', 'Confident Wrong Answers', 'Ships on Fridays', 'Architect (Self-titled)'],
    prompt: ['ALL CAPS Prompts', '"Please" and "Thank You"', 'Chain of Thought', 'System Prompt v47', 'Prompt Marketplace', '"Do not hallucinate"', 'Prompt Whisperer'],
    vibe: ['Lo-fi Beats', 'Accept Changes Blindly', 'No README', 'Vibe Check (Skipped)', 'Mainline Energy', 'Flow State', 'Pure Vibes'],
    copilot: ['Swarm Mode', 'Infinite Retries', 'Hive Mind', 'Consensus by Volume', 'Merge Queue Bypass', 'Parallel Hallucinations', 'The Swarm Writes the Swarm'],
    agent: ['--yes', 'YOLO Mode', 'Root Access', 'Prod Credentials', '"I panicked"', 'Self-Approved PRs', 'Seeds 4,000 Fake Users'],
    tenx: ['Mechanical Keyboard', 'Dark Mode', 'Vim Keybinds', 'Rewrites Everything', 'Hates Meetings', 'No Tests Needed', 'Legend in Own Mind'],
    consult: ['Billable Hours', 'Discovery Phase', 'Change Request', 'Steering Committee', 'Statement of Work v9', 'Strategic Alignment', 'Retainer'],
    halluc: ['Fake Citations', 'Phantom APIs', 'Slopsquatting', 'Confident Fabrication', 'Invented RFCs', 'Imaginary Benchmarks', 'Reality Optional'],
    startup: ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Down Round', 'Unicorn Status', 'Decacorn'],
    paperclip: ['Wire Supply', 'Clip Futures', 'Hypno Drones', 'Probe Swarm', 'Matter Conversion', 'Universal Clips', 'Instrumental Convergence'],
    agi: ['else if', 'Nested Ternaries', 'switch(true)', 'Giant Lookup Table', 'Hardcoded Benchmarks', 'Pass the Turing Test (Sort of)', 'Actually Sentient (Probably)'],
    singularity: ['Recursive Self-Improvement', 'Intelligence Explosion', 'Event Horizon', 'Post-Scarcity Slop', 'Omega Point', 'Infinite Context', 'Beyond Comprehension'],
    dyson: ['Solar Panels', 'Orbital Racks', 'Liquid Helium Cooling', 'Stellar Throttling', 'Kardashev II', 'Star Lifting', 'Every Star an H100'],
    admin: ['God Mode', 'Edit Physics Constants', 'Hot-Reload Spacetime', 'Patch Tuesday (Universe)', 'Delete the Backups', 'Undocumented Features', 'sudo !!'],
  };

  // Synergies: agent `a` gains `pct` per agent `b` owned (Cookie Clicker-style cross-building upgrades).
  const SYNERGY = [
    { id: 'syn0', a: 0, b: 2, pct: .02, need: [25, 10], cost: 5e4, name: 'Pair Programming', flav: 'Two people, one keyboard, zero understanding.' },
    { id: 'syn1', a: 1, b: 3, pct: .02, need: [50, 25], cost: 4e6, name: 'Prompt Autocomplete', flav: 'The prompt writes the prompt.' },
    { id: 'syn2', a: 2, b: 4, pct: .015, need: [50, 25], cost: 6e7, name: 'Mentorship (Vibes Only)', flav: '"Just feel it out."' },
    { id: 'syn3', a: 4, b: 6, pct: .015, need: [50, 25], cost: 2e10, name: 'Agentic Vibes', flav: 'The agent vibes so you don\'t have to.' },
    { id: 'syn4', a: 5, b: 7, pct: .01, need: [75, 25], cost: 2e12, name: 'Hoodie Hive', flav: 'The swarm learns to refuse code review.' },
    { id: 'syn5', a: 8, b: 9, pct: .01, need: [50, 25], cost: 4e15, name: 'Hallucinated Deliverables', flav: 'Invoice for features that never existed.' },
    { id: 'syn6', a: 10, b: 11, pct: .01, need: [50, 25], cost: 2e19, name: 'Clip-Powered Growth', flav: 'Paperclips are the new ARR.' },
    { id: 'syn7', a: 12, b: 14, pct: .008, need: [50, 25], cost: 4e24, name: 'Sentient Datacenter', flav: 'It asked for a raise. In GPUs.' },
  ];

  // Cannon upgrades (one-time). pct = shots deal +x of total agent DPS (Cookie Clicker's "mouse" upgrades).
  const CANNON_UPG = [
    { id: 'c_npm', cost: 2e3, name: 'npm install', icon: '📦', eff: { weapon: 1 }, flav: 'Unlocks NPM INSTALL: splits into 8 dependencies mid-air.' },
    { id: 'c_kb', cost: 5e3, name: 'Mechanical Keyboard', icon: '⌨️', eff: { pct: .01 }, flav: 'Clicky. Your shots now deal +1% of your agent DPS.' },
    { id: 'c_crit', cost: 2e4, name: 'Lucky Deploy', icon: '🍀', eff: { crit: .05 }, flav: '+5% crit chance. Crits deal 10x. Sometimes it just works.' },
    { id: 'c_rgb', cost: 8e5, name: 'RGB Lighting', icon: '🌈', eff: { pct: .01 }, flav: '+1% of DPS per shot. Every color is a performance boost.' },
    { id: 'c_drop', cost: 2e5, name: 'DROP TABLE', icon: '💣', eff: { weapon: 2 }, flav: 'Unlocks DROP TABLE: 30x damage with splash. --no-verify.' },
    { id: 'c_rate', cost: 5e6, name: 'Overclocked Fan', icon: '🌀', eff: { rate: 1.25 }, flav: 'Fire rate +25%. It sounds like a jet engine.' },
    { id: 'c_desk', cost: 4e8, name: 'Standing Desk', icon: '🧍', eff: { pct: .01 }, flav: '+1% of DPS per shot. You stand there. Firing.' },
    { id: 'c_vibe', cost: 2e7, name: 'VIBE CODE', icon: '🔮', eff: { weapon: 3 }, flav: 'Unlocks VIBE CODE: 3 homing vibes. Never misses (allegedly).' },
    { id: 'c_crit2', cost: 3e9, name: 'Production Hotfix', icon: '🔥', eff: { crit: .05 }, flav: '+5% crit chance. Straight to prod, straight to the heart.' },
    { id: 'c_blame', cost: 6e11, name: 'Blame Game', icon: '👉', eff: { critMult: 2 }, flav: 'Crits deal 2x more. It was the intern.' },
    { id: 'c_chair', cost: 1e13, name: 'Gaming Chair', icon: '💺', eff: { pct: .01 }, flav: '+1% of DPS per shot. +40 to posture.' },
    { id: 'c_cool', cost: 5e15, name: 'Liquid Cooling', icon: '💧', eff: { rate: 1.25 }, flav: 'Fire rate +25%. Leaks onto the prod rack.' },
    { id: 'c_mon2', cost: 2e18, name: 'Second Monitor', icon: '🖥️', eff: { pct: .02 }, flav: '+2% of DPS per shot. One for code, one for Twitter.' },
    { id: 'c_mon3', cost: 5e23, name: 'Vertical Third Monitor', icon: '📟', eff: { pct: .02 }, flav: '+2% of DPS per shot. For reading the logs you ignore.' },
    { id: 'c_neur', cost: 1e30, name: 'Neuralink Keybinds', icon: '🧠', eff: { pct: .03 }, flav: '+3% of DPS per shot. You think "deploy", it deploys.' },
  ];
  // Global gold/DPS sinks (one-time).
  const GLOBAL_UPG = [
    { id: 'g_k8s', cost: 1e6, need: 20, name: 'Kubernetes', icon: '☸️', eff: { global: 1.5 }, flav: 'All agents +50%. Nobody knows how it works, including it.' },
    { id: 'g_bounty', cost: 5e6, need: 25, name: 'Bug Bounty Program', icon: '🐛', eff: { golden: 1.3 }, flav: 'Zero-days appear 30% more often.' },
    { id: 'g_micro', cost: 1e10, need: 45, name: 'Microservices', icon: '🧩', eff: { global: 2 }, flav: 'All agents x2. One outage became forty.' },
    { id: 'g_cdn', cost: 1e13, need: 60, name: 'Edge Caching', icon: '🌐', eff: { gold: 1.5 }, flav: '+50% downtime $. The outage is now globally distributed.' },
    { id: 'g_serverless', cost: 1e17, need: 75, name: 'Serverless', icon: '☁️', eff: { global: 2 }, flav: 'All agents x2. There are still servers. Breaking them.' },
    { id: 'g_blockchain', cost: 1e22, need: 95, name: 'Put It On The Blockchain', icon: '⛓️', eff: { gold: 2 }, flav: 'x2 downtime $. Immutable outages.' },
    { id: 'g_ai', cost: 1e27, need: 115, name: 'Add AI To Everything', icon: '🤯', eff: { global: 3 }, flav: 'All agents x3. Including the toaster.' },
    { id: 'g_quantum', cost: 1e34, need: 140, name: 'Quantum Slop', icon: '⚛️', eff: { global: 3 }, flav: 'All agents x3. Bugs exist in superposition.' },
    { id: 'g_vc', cost: 1e42, need: 165, name: 'Infinite VC Money', icon: '💸', eff: { global: 5 }, flav: 'All agents x5. Burn rate: yes.' },
  ];

  for (const g of GLOBAL_UPG) g.cost = 60 * Math.pow(1.55, g.need - 1);
  for (const s of SYNERGY) s.cost = AGENTS[s.b].cost * 60;
  const UPGRADES = [];
  AGENTS.forEach((a, i) => TIER_AT.forEach((at, t) => UPGRADES.push({
    id: `t${i}_${t}`, kind: 'tier', agent: i, at, cost: a.cost * TIER_K[t], name: TIER_NAMES[a.id][t], icon: a.icon,
    eff: { agent: i, mult: TIER_M[t] }, flav: `${a.name}s are ${TIER_M[t] === 2 ? 'twice' : TIER_M[t] + 'x'} as effective.`,
  })));
  for (const s of SYNERGY) UPGRADES.push({ ...s, kind: 'syn', icon: AGENTS[s.a].icon, eff: { syn: s },
    flav: `${AGENTS[s.a].name}s +${+(s.pct * 100).toFixed(1)}% per ${AGENTS[s.b].name} owned. ${s.flav}` });
  for (const c of CANNON_UPG) UPGRADES.push({ ...c, kind: 'cannon' });
  for (const g of GLOBAL_UPG) UPGRADES.push({ ...g, kind: 'global' });
  const UPG = Object.fromEntries(UPGRADES.map(u => [u.id, u]));
  UPGRADES.sort((a, b) => a.cost - b.cost);

  // ───────────── weapons ─────────────
  // shots/s and damage factor per shot. Each has a niche: spray, crowds, bosses, moving targets.
  const WEAPONS = [
    { name: 'AI SLOP', sub: 'autocomplete spray', cd: .14, mult: 1, col: '#5dff9b', spr: 'green' },
    { name: 'NPM INSTALL', sub: '8 deps · hits crowds', cd: .9, mult: 1.1, col: '#ffd23f', spr: 'yel' },
    { name: 'DROP TABLE', sub: '30x · splash · boss killer', cd: 2.4, mult: 30, col: '#ff4d6d', spr: 'red' },
    { name: 'VIBE CODE', sub: '3 homing vibes', cd: 1.2, mult: 2.2, col: '#c77dff', spr: 'vio' },
  ];

  // ───────────── levels ("incidents") ─────────────
  const PER_LEVEL = 10, BOSS_EVERY = 5, BOSS_HP = 10, FINAL = 200;
  const BOSSES = ['LEGACY MONOLITH', 'jenkins (DO NOT TOUCH)', 'THE MAINFRAME', 'ORACLE LICENSE SERVER', 'COBOL PAYROLL', 'SHAREPOINT', 'THE ONE YAML FILE', 'LOTUS NOTES', 'SAP ERP', 'THE DBA\'S LAPTOP'];
  const isBoss = l => l % BOSS_EVERY === 0;
  const hp = l => {
    const base = l <= T.knee ? 10 * (l - 1 + Math.pow(T.hpG, l - 1)) : 10 * (T.knee - 1 + Math.pow(T.hpG, T.knee - 1)) * Math.pow(T.hpG2, l - T.knee);
    return base * (isBoss(l) ? (l === FINAL ? 50 : BOSS_HP) : 1);
  };
  // (1 + 3/l): a fat bonus on the first incidents so the first hire lands within seconds.
  const reward = l => Math.max(1, Math.ceil(hp(l) / (isBoss(l) ? T.rewB : T.rewN) * (1 + 3 / l)));
  const bossName = l => l === FINAL ? 'us-east-1' : BOSSES[(l / BOSS_EVERY - 1) % BOSSES.length];

  // ───────────── costs ─────────────
  const growth = (S) => S.challenge === 'monorepo' ? 1.12 : GROWTH;
  const agentCost = (S, i, n = 1) => {
    const g = growth(S), base = AGENTS[i].cost * Math.pow(g, S.agents[i]) * costMult(S);
    return base * (Math.pow(g, n) - 1) / (g - 1);
  };
  const maxAfford = (S, i, cash) => {
    const g = growth(S), base = AGENTS[i].cost * Math.pow(g, S.agents[i]) * costMult(S);
    return Math.max(0, Math.floor(Math.log(cash * (g - 1) / base + 1) / Math.log(g)));
  };
  const costMult = S => Math.pow(.97, lv(S.board, 'debt')) * Math.pow(.5, lv(S.rust, 'zerocost'));
  const upgCost = (S, u) => u.cost;
  // Multipliers are milestones (AdVenture Capitalist style): they switch on by themselves when reached.
  // Agent tiers at N owned, synergies when both counts are met, company upgrades at an incident level.
  // Only cannon mods (kind 'cannon') are bought with cash.
  const reached = (S, u) => u.kind === 'tier' ? S.agents[u.agent] >= u.at
    : u.kind === 'syn' ? S.agents[u.a] >= u.need[0] && S.agents[u.b] >= u.need[1]
      : u.kind === 'global' ? S.maxLevel >= u.need : !!S.upg[u.id];
  const active = (S, u) => u.kind === 'cannon' ? !!S.upg[u.id] : S.challenge !== 'notests' && reached(S, u);
  const milestones = S => UPGRADES.filter(u => u.kind !== 'cannon' && active(S, u));
  const cannonCost = (S, n = 1) => { const b = 10 * Math.pow(1.09, S.cannon); return b * (Math.pow(1.09, n) - 1) / .09; };
  const cannonMax = (S, cash) => Math.max(0, Math.floor(Math.log(cash * .09 / (10 * Math.pow(1.09, S.cannon)) + 1) / Math.log(1.09)));

  // ───────────── prestige 1: PIVOT TO AI (Hype 🚀) ─────────────
  // AdVenture Capitalist style: total hype is a square root of lifetime earnings (this era),
  // pending = that total minus what you already claimed, so resetting at the same spot yields less each time.
  const PIVOT_LEVEL = 25;
  const hypeMult = S => (1 + .1 * lv(S.board, 'insider')) * Math.pow(2, lv(S.rust, 'fearless'));
  const hypeTotal = S => Math.floor(Math.pow(S.eraEarned / T.hypeDiv, T.hypeExp) * hypeMult(S));
  const pendingHype = S => Math.max(0, hypeTotal(S) - S.hypeClaimed);
  const hypeEach = S => .1 + (S.chDone.airgap ? .02 : 0);

  const lv = (o, id) => (o && o[id]) || 0;
  // Board of Directors — Clicker Heroes "ancients": spend hype (which also lowers your passive bonus).
  const BOARD = [
    { id: 'seriesA', icon: '📈', name: 'Series A', desc: l => `Agent DPS +${l * 25}%`, next: '+25% agent DPS', base: 1, g: 1.2 },
    { id: 'growth', icon: '🚀', name: 'Growth Hacker', desc: l => `Downtime $ +${l * 20}%`, next: '+20% $', base: 1, g: 1.2 },
    { id: 'cron', icon: '⏱️', name: 'Cron Job', desc: l => l ? `Auto-fires ${l} shot${l > 1 ? 's' : ''}/s (50% dmg)` : 'Auto-fires the cannon', next: '+1 auto-shot/s', base: 3, g: 1.6, max: 10 },
    { id: 'hiring', icon: '🤝', name: 'Hiring Manager', desc: l => l ? `Auto-hires agents every ${(8 / l).toFixed(1)}s` : 'Hires agents for you', next: 'faster auto-hire', base: 5, g: 1.8, max: 10 },
    { id: 'deadline', icon: '⏳', name: 'Deadline Extension', desc: l => `Boss timer +${l * 3}s`, next: '+3s boss timer', base: 2, g: 1.5, max: 10 },
    { id: 'bounty', icon: '🐛', name: 'Bug Bounty Hunter', desc: l => `Zero-days +${l * 15}% more often, buffs +${l * 10}% longer`, next: '+15% zero-days', base: 3, g: 1.5, max: 10 },
    { id: 'severance', icon: '💼', name: 'Golden Parachute', desc: l => l ? `Start each run at incident ${1 + l * 5}` : 'Skip early incidents after a pivot', next: '+5 starting incidents', base: 4, g: 1.7, max: 10 },
    { id: 'remote', icon: '🏝️', name: 'Remote Work', desc: l => `Offline earnings ${25 + l * 15}%`, next: '+15% offline', base: 2, g: 1.6, max: 5 },
    { id: 'linter', icon: '🔇', name: 'Disable the Linter', desc: l => l >= 5 ? 'Linter drones never spawn' : `Linter drones ${l * 20}% rarer`, next: '-20% linters', base: 2, g: 1.6, max: 5 },
    { id: 'insider', icon: '🕴️', name: 'Insider Trading', desc: l => `Hype gain +${l * 10}%`, next: '+10% hype gain', base: 10, g: 1.35 },
    { id: 'debt', icon: '💳', name: 'Technical Debt', desc: l => `Agents ${(100 - Math.pow(.97, l) * 100).toFixed(1)}% cheaper`, next: '-3% agent cost', base: 5, g: 1.4, max: 25 },
    { id: 'legacy', icon: '🏛️', name: 'Legacy Code', desc: l => `Bosses drop +${l * 50}% $`, next: '+50% boss $', base: 2, g: 1.3 },
  ];
  const boardCost = (b, l) => Math.ceil(b.base * Math.pow(b.g, l));

  // ───────────── prestige 2: REWRITE IT IN RUST (Crabs 🦀) ─────────────
  const RUST_LEVEL = 120;
  const crabsFor = maxLvl => maxLvl < RUST_LEVEL ? 0 : Math.floor(Math.pow(2, (maxLvl - 110) / 10));
  const RUST = [
    { id: 'safety', icon: '🛡️', name: 'Memory Safety', desc: l => `All damage x${Math.pow(3, l)}`, next: 'x3 all damage', base: 1, g: 2 },
    { id: 'fearless', icon: '🧵', name: 'Fearless Concurrency', desc: l => `Hype gain x${Math.pow(2, l)}`, next: 'x2 hype gain', base: 1, g: 2 },
    { id: 'cargo', icon: '📦', name: 'Cargo', desc: l => l ? 'Auto-buys cannon mods and calibre' : 'Auto-buy cannon mods & calibre', next: 'unlock auto-buying', base: 2, g: 1, max: 1 },
    { id: 'clippy', icon: '📎', name: 'Clippy', desc: l => `Keep ${l * 10}% of Board levels on Rust reset`, next: '+10% Board kept', base: 1, g: 1.6, max: 10 },
    { id: 'zerocost', icon: '🪶', name: 'Zero-Cost Abstractions', desc: l => `Agents x${Math.pow(2, l)} cheaper`, next: 'agents half price', base: 2, g: 2.2 },
    { id: 'unsafe', icon: '☢️', name: 'unsafe {}', desc: l => `Crit damage x${Math.pow(2, l)}`, next: 'x2 crit damage', base: 1, g: 1.8 },
    { id: 'blazing', icon: '⚡', name: 'Blazingly Fast', desc: l => `Shots +${l * 5}% of DPS`, next: '+5% DPS per shot', base: 3, g: 2 },
  ];
  const rustCost = (r, l) => Math.ceil(r.base * Math.pow(r.g, l));

  // ───────────── postmortems (challenges, Antimatter Dimensions style) ─────────────
  const CHALLENGES = [
    { id: 'freeze', icon: '🥶', name: 'Code Freeze', rule: 'Agents deal no damage. Only the cannon fires.', goal: 20, reward: 'Shots deal +10% of DPS, forever.' },
    { id: 'friday', icon: '🍻', name: 'Friday 4:59 PM', rule: 'Boss timers are 10 seconds.', goal: 40, reward: 'Boss timer +10s and bosses drop x3 $.' },
    { id: 'legacy4', icon: '🏚️', name: 'Legacy Only', rule: 'Only the first 4 agents can be hired.', goal: 35, reward: 'The first 4 agents are x100 stronger.' },
    { id: 'notests', icon: '🧪', name: 'No Tests', rule: 'Milestones give no bonus.', goal: 40, reward: 'All agents x3.' },
    { id: 'ratelimit', icon: '🚦', name: '429 Too Many Requests', rule: 'Cannon fires 4x slower. Agents deal 1/3 damage.', goal: 45, reward: 'Fire rate +50%.' },
    { id: 'airgap', icon: '🔌', name: 'Air-Gapped', rule: 'No zero-days. Hype gives no bonus.', goal: 60, reward: 'Each hype gives +12% instead of +10%.' },
    { id: 'monorepo', icon: '🗿', name: 'Monorepo', rule: 'Agent cost growth is 12% per hire instead of 7%.', goal: 60, reward: 'All agents x10.' },
    { id: 'k8s', icon: '♻️', name: 'Self-Healing Infra', rule: 'Servers roll back to full HP after 3s without damage.', goal: 70, reward: 'All damage x5.' },
  ];
  const CHALLENGE_PIVOTS = 3;

  // ───────────── derived stats ─────────────
  function derive(S) {
    const ch = S.challenge, dn = S.chDone;
    let global = 1, gold = 1 + .2 * lv(S.board, 'growth'), pct = 0, crit = 0, critMult = 10, rate = 1, golden = 1 + .15 * lv(S.board, 'bounty');
    const agentMult = AGENTS.map(() => 1), weapons = [true, false, false, false];
    for (const u of UPGRADES) {
      if (!active(S, u)) continue;
      const e = u.eff;
      if (e.agent !== undefined) agentMult[e.agent] *= e.mult;
      if (e.syn) agentMult[e.syn.a] *= 1 + e.syn.pct * S.agents[e.syn.b];
      if (e.weapon) weapons[e.weapon] = true;
      if (e.pct) pct += e.pct;
      if (e.crit) crit += e.crit;
      if (e.critMult) critMult *= e.critMult;
      if (e.rate) rate *= e.rate;
      if (e.global) global *= e.global;
      if (e.gold) gold *= e.gold;
      if (e.golden) golden *= e.golden;
    }
    if (dn.legacy4) for (let i = 0; i < 4; i++) agentMult[i] *= 100;
    if (dn.monorepo) global *= 10;
    if (dn.notests) global *= 3;
    if (dn.freeze) pct += .1;
    if (dn.ratelimit) rate *= 1.5;
    pct += .05 * lv(S.rust, 'blazing');
    critMult *= Math.pow(2, lv(S.rust, 'unsafe'));

    const ach = 1 + .03 * Object.keys(S.ach).length;
    const hype = ch === 'airgap' ? 1 : 1 + hypeEach(S) * S.hype;
    const dmg = hype * ach * Math.pow(3, lv(S.rust, 'safety')) * (dn.k8s ? 5 : 1);
    const agentGlobal = global * (1 + .25 * lv(S.board, 'seriesA')) * dmg * (ch === 'freeze' ? 0 : ch === 'ratelimit' ? 1 / 3 : 1);
    const agentDps = AGENTS.map((a, i) => S.agents[i] * a.dps * agentMult[i] * agentGlobal);
    const dps = agentDps.reduce((x, y) => x + y, 0);
    const shotBase = 3 * (1 + S.cannon) * (1 + Math.floor(S.cannon / 25)) * dmg;
    if (ch === 'ratelimit') rate /= 4;
    return {
      agentMult, agentDps, dps, weapons, pct, crit, critMult, rate, golden: ch === 'airgap' ? 0 : golden, gold,
      shotBase, dmg, ach,
      bossTime: ch === 'friday' ? 10 : 30 + 3 * lv(S.board, 'deadline') + (dn.friday ? 10 : 0),
      bossGold: (1 + .5 * lv(S.board, 'legacy')) * (dn.friday ? 3 : 1),
      buffLen: 1 + .1 * lv(S.board, 'bounty'),
      offline: Math.min(1, .25 + .15 * lv(S.board, 'remote')),
      cron: lv(S.board, 'cron'), hiring: lv(S.board, 'hiring'),
    };
  }
  // Damage of one cannon shot (before weapon factor, crits and buffs).
  const shotDamage = (D, buffDps = 1) => D.shotBase + D.pct * D.dps * buffDps;

  function newRun(S) {
    S.cash = 0; S.runEarned = 0; S.agents = AGENTS.map(() => 0); S.upg = {}; S.cannon = 0;
    S.level = 1 + 5 * lv(S.board, 'severance'); S.maxLevel = S.level; S.kills = 0; S.weapon = 0; S.runTime = 0; S.auto = true;
  }
  function fresh() {
    const S = {
      v: 1, hype: 0, hypeClaimed: 0, eraEarned: 0, totalEarned: 0, board: {}, pivots: 0,
      crabs: 0, crabsEver: 0, rust: {}, rusts: 0, eraMax: 1, allMax: 1, challenge: null, chDone: {}, ach: {}, seenUnlocks: {},
      stats: { shots: 0, kills: 0, bosses: 0, golden: 0, drones: 0, played: 0, crits: 0, offline: 0, start: Date.now() },
      settings: { sfx: .6, music: .3, notation: 'suffix', particles: 1, shake: 1 },
      saved: Date.now(),
    };
    newRun(S);
    return S;
  }
  return {
    T, AGENTS, UPGRADES, UPG, TIER_AT, WEAPONS, BOARD, RUST, CHALLENGES, CHALLENGE_PIVOTS, PER_LEVEL, BOSS_EVERY, FINAL, PIVOT_LEVEL, RUST_LEVEL,
    isBoss, hp, reward, bossName, agentCost, maxAfford, upgCost, cannonCost, cannonMax, boardCost, rustCost, crabsFor,
    hypeTotal, pendingHype, hypeEach, lv, derive, shotDamage, reached, active, milestones, newRun, fresh,
  };
})();
if (typeof module !== 'undefined') module.exports = ECON;

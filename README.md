# SLOP CANNON: Idle Ops 💥

An idle/incremental game in one HTML canvas. Hire AI agents to fire slop code at production servers, pivot to AI, rewrite it in Rust, and take down **us-east-1**.

**▶ Play: https://bryantebeek.github.io/slop-cannon/**

No build step, no frameworks. Icons are [Phosphor](https://phosphoricons.com) duotone (MIT), bundled in `vendor/`. Progress autosaves to localStorage and keeps earning while you're away.

## The loop

| Layer | What you do | Inspired by |
|---|---|---|
| **Cannon** | Hold the mouse on prod to fire. Calibre, crits, fire rate, and 4 modes (AI SLOP, NPM INSTALL, DROP TABLE, VIBE CODE) | Clicker Heroes' click hero |
| **Agents** | 16 generators, from Intern to Simulation Admin, each firing its own slop lines. 7% cost growth | Clicker Heroes |
| **Milestones** | 129 automatic multipliers: per-agent tiers at 10/25/50/100/150/200/300 owned, cross-agent synergies, and company upgrades at incident levels. No buying needed | AdVenture Capitalist, Cookie Clicker |
| **Incidents** | 10 servers per incident; overkill chains between servers; every 5th is a timed legacy boss; farm or auto-advance | Clicker Heroes zones |
| **Zero-days** | Golden packages fly by; shoot one for an AI-X-meme effect: FEEL THE AGI, LEAKED API KEY, TIBO PRESSED THE RESET BUTTON, YOU'RE ABSOLUTELY RIGHT!, MAKE NO MISTAKES, @GROK IS THIS TRUE?, IT'S SO OVER → WE'RE SO BACK, COMPACTING CONVERSATION…, HOTFIX, ULTRATHINK, OUR GPUS ARE MELTING, FORGET THE CODE EVEN EXISTS, 529 OVERLOADED_ERROR, --dangerously-skip-permissions, RALPH WIGGUM LOOP, AGI ACHIEVED INTERNALLY | Cookie Clicker golden cookies |
| **Frontier drops** | Rare zero-days voiced (in parody) by the frontier-lab bosses: **Claude Mythos** (every shot crits + 2 bonus zero-days), **Hidden access to Bel** (agents x20, then rate limited), **ZUCK IT** (vacuums this incident and the next 4), **Full Self-Deploying** (hands-free autopilot at 30 shots/s) | |
| **Linter drones** | Block your agents' shots until you shoot them down | |
| **🚀 Pivot to AI** | Prestige layer 1: hype = (era earnings ÷ 40)^0.16, +10% damage each, or spend it on the Board of Directors (Cron Job auto-fire, Hiring Manager auto-buy, offline earnings…) | AdVenture Capitalist angels, Clicker Heroes ancients, Egg, Inc. exponent |
| **📝 Postmortems** | 8 challenge runs with nasty rules and permanent rewards | Antimatter Dimensions challenges |
| **🦀 Rewrite It In Rust** | Prestige layer 2 at incident 120: crabs for the Borrow Checker tree | Realm Grinder / AD multi-layer prestige |
| **🏆 Trophies & news** | 78 trophies (+3% each, 9 secret) and a Hacker News ticker that reacts to your progress | Cookie Clicker |

## Controls

| Input | Action |
|---|---|
| Hold mouse / Space | Fire at the cursor |
| 1-4 | Cannon mode |
| ← / → | Previous / next incident |
| F | Toggle farm / auto-advance |
| B | Cycle buy amount (x1 / x10 / x25 / x100 / MAX) |
| M | Mute |

## Balance

`econ.js` holds every formula and number, with no DOM. `node sim.js active [hours]` runs a greedy headless player and prints the pacing: first pivot at about 20 minutes, then runs of 15–25 minutes that each push 5–15 incidents further. You can override any knob with `SLOP_<knob>=value`. `node test.js` asserts that every multiplier source (158 checks) moves damage, gold, cost or hype by exactly its advertised amount.

No real servers were harmed. They were already like this.

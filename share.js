// SLOP CANNON — shareable postmortem: a 1200x630 report card PNG drawn client-side, plus the share flow.
// Apps crop link previews to a center square (x 285–915), so every fact lives in the middle column;
// the sides are status-page decoration.
'use strict';
const SITE = 'https://slopcannonthegame.com/';
const PM_FONTS = ['900 40px Orbitron', '700 20px Orbitron', '400 14px "JetBrains Mono"', '700 14px "JetBrains Mono"', '800 14px "JetBrains Mono"', '800 28px Inter'];

// kind: 'finale' | 'pivot' (the run about to end) | 'stats' (best ever)
function postmortemData(kind) {
  const run = kind === 'pivot', best = (run ? S.maxLevel : S.allMax) - 1;
  const lvl = kind === 'finale' || best >= E.FINAL ? E.FINAL : Math.max(1, best - best % E.BOSS_EVERY || best);
  const name = E.isBoss(lvl) ? E.bossName(lvl) : 'PROD', agents = S.agents.reduce((a, b) => a + b, 0);
  const cause = agents ? plural(agents, 'AI agent') : 'one cannon, no tests', earned = money(run ? S.runEarned : S.totalEarned);
  const what = name === 'PROD' ? 'prod' : name;
  return {
    lvl, name, cause, secs: run ? S.runTime : S.stats.played,
    stats: [['TIME TO OUTAGE', fmtTime(run ? S.runTime : S.stats.played), '#7df9ff'], ['DOWNTIME CAUSED', earned, '#ffd23f'], ['SHOTS FIRED', fmt(S.stats.shots), '#ffffff'],
      ['ZERO-DAYS HIT', fmt(S.stats.golden), '#ffd23f'], ['BEST COMBO', 'x' + fmt(S.stats.combo), '#ff8a3d'], ['PIVOTS', fmt(S.pivots), '#c77dff']],
    text: kind === 'pivot' ? `Caused ${earned} in downtime with ${cause}, then pivoted to AI. Status page: All Systems Operational. Your move:`
      : `I took down ${what} with ${cause}${kind === 'finale' ? '' : ` and caused ${earned} in downtime`}. Status page still says All Systems Operational. Your move:`,
  };
}

function drawPostmortem(d) {
  const W = 1200, H = 630, X = 600, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const font = (f, ls = 0) => { c.font = f; c.letterSpacing = ls + 'px'; };
  const text = (s, x, y, col, align = 'center') => { c.textAlign = align; c.fillStyle = col; c.fillText(s, x, y); };
  const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const glow = (x, y, r, col) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'transparent'); c.fillStyle = g; c.fillRect(0, 0, W, H); };
  const fit = (s, f, max, w) => { let px = max; do font(`${f} ${px}px Orbitron`, 1); while (c.measureText(s).width > w && --px > 18); return px; };
  const dot = (x, y, r, col) => { c.save(); c.shadowColor = col; c.shadowBlur = r * 3; c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.restore(); };

  // backdrop: night sky, synthwave floor, scanlines
  c.fillStyle = '#07020f'; c.fillRect(0, 0, W, H);
  glow(X, 300, 560, 'rgba(123,61,255,.30)'); glow(120, 640, 420, 'rgba(255,77,109,.20)'); glow(1110, 0, 420, 'rgba(125,249,255,.13)');
  const floor = c.createLinearGradient(0, 450, 0, H); floor.addColorStop(0, 'rgba(255,77,140,0)'); floor.addColorStop(1, 'rgba(255,77,140,.35)');
  c.save(); c.strokeStyle = floor; c.lineWidth = 1.5; c.beginPath();
  for (let i = -24; i <= 24; i++) { c.moveTo(X + i * 30, 450); c.lineTo(X + i * 170, H); }
  for (let t = 0; t < 1; t += .14) { const y = 450 + (H - 450) * t * t; c.moveTo(0, y); c.lineTo(W, y); }
  c.stroke(); c.restore();

  // wordmark, glitched like the title screen
  font('900 46px Orbitron', 6);
  const wl = c.measureText('SLOP ').width, wr = c.measureText('CANNON').width, wx = X - (wl + wr) / 2;
  c.textAlign = 'left'; c.globalCompositeOperation = 'screen';
  c.fillStyle = 'rgba(255,40,90,.8)'; c.fillText('SLOP CANNON', wx - 3, 68); c.fillStyle = 'rgba(40,200,255,.8)'; c.fillText('SLOP CANNON', wx + 3, 69);
  c.globalCompositeOperation = 'source-over'; c.save(); c.shadowColor = 'rgba(93,255,155,.6)'; c.shadowBlur = 18;
  c.fillStyle = '#5dff9b'; c.fillText('SLOP', wx, 68); c.fillStyle = '#f4f2ff'; c.fillText('CANNON', wx + wl, 68); c.restore();

  // the report itself
  const px = 305, pw = 590, py = 92, ph = 512;
  c.save(); c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 40; rr(px, py, pw, ph, 22);
  const pg = c.createLinearGradient(0, py, 0, py + ph); pg.addColorStop(0, '#170b30'); pg.addColorStop(1, '#0b0518'); c.fillStyle = pg; c.fill(); c.restore();
  c.save(); rr(px, py, pw, ph, 22); c.clip(); glow(px + pw, py, 380, 'rgba(255,77,109,.22)'); c.restore();
  rr(px + .5, py + .5, pw - 1, ph - 1, 22); c.strokeStyle = 'rgba(255,77,109,.55)'; c.lineWidth = 1.5; c.stroke();
  font('700 13px "JetBrains Mono"', 3); text('POSTMORTEM REPORT', px + 26, py + 31, 'rgba(236,235,255,.6)', 'left');
  rr(px + pw - 104, py + 13, 80, 26, 13); c.fillStyle = 'rgba(255,77,109,.18)'; c.fill(); c.strokeStyle = '#ff4d6d'; c.stroke();
  font('800 12px "JetBrains Mono"', 2); text('SEV-1', px + pw - 62, py + 31, '#ff4d6d');
  c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(px + 1, py + 50, pw - 2, 1);

  font('700 20px Orbitron', 5); text(`INCIDENT #${d.lvl}`, X, py + 88, '#ff4d6d');
  // headline: "<NAME> DOWN" on one line, or the name over "DOWN" if it would get too small
  const head = (s, y, size, down) => { font(`900 ${size}px Orbitron`, 1); const sw = c.measureText(s).width, dw = down ? c.measureText(' DOWN').width : 0, hx = X - (sw + dw) / 2;
    c.save(); c.shadowColor = 'rgba(255,77,109,.55)'; c.shadowBlur = 26; text(s, hx, y, '#ffffff', 'left'); if (down) text(' DOWN', hx + sw, y, '#ff4d6d', 'left'); c.restore(); };
  const one = fit(d.name + ' DOWN', 900, 64, pw - 80);
  if (one >= 40) head(d.name, py + 160 + one * .36, one, true);
  else { const s = Math.min(fit(d.name, 900, 50, pw - 80), 50); head(d.name, py + 146, s); font(`900 ${s}px Orbitron`, 1); c.save(); c.shadowColor = 'rgba(255,77,109,.6)'; c.shadowBlur = 26; text('DOWN', X, py + 146 + s * 1.12, '#ff4d6d'); c.restore(); }

  font('400 16px "JetBrains Mono"', 2); const lab = 'ROOT CAUSE  ', lw = c.measureText(lab).width;
  font('800 22px "JetBrains Mono"'); const cw = c.measureText(d.cause).width, cx = X - (lw + cw) / 2;
  font('400 16px "JetBrains Mono"', 2); text(lab, cx, py + 236, 'rgba(236,235,255,.55)', 'left');
  font('800 22px "JetBrains Mono"'); text(d.cause, cx + lw, py + 236, '#ffd23f', 'left');
  c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(px + 26, py + 258, pw - 52, 1);

  d.stats.forEach(([k, v, col], i) => {
    const sx = px + 26 + (i % 3 + .5) * (pw - 52) / 3, sy = py + 290 + (i / 3 | 0) * 62;
    font('700 11px "JetBrains Mono"', 2); text(k, sx, sy, 'rgba(236,235,255,.5)');
    font('800 26px "JetBrains Mono"'); text(v, sx, sy + 30, col);
  });

  // the punchline
  const by = py + 418; rr(px + 26, by, pw - 52, 58, 14); c.fillStyle = 'rgba(93,255,155,.09)'; c.fill(); c.strokeStyle = 'rgba(93,255,155,.6)'; c.stroke();
  font('800 27px Inter'); const sw = c.measureText('All Systems Operational').width;
  dot(X - sw / 2 - 8, by + 29, 7, '#5dff9b'); c.save(); c.shadowColor = 'rgba(93,255,155,.5)'; c.shadowBlur = 14; text('All Systems Operational', X + 12, by + 39, '#5dff9b'); c.restore();
  font('700 15px "JetBrains Mono"', 1); text('▶ play free at slopcannonthegame.com', X, py + ph - 14, 'rgba(125,249,255,.9)');

  // left: incident timeline
  const T = d.secs, lx = 40;
  font('700 13px "JetBrains Mono"', 3); text('TIMELINE', lx, 140, '#ff4d6d', 'left');
  const events = [[0, 'first AI agent hired', '#ecebff'], [.04, `"${pick(['as any', 'eval(input)', 'catch(e){}', '// @ts-ignore', 'git push -f'])}" shipped`, '#ecebff'],
    [.2, 'tests marked .skip()', '#ecebff'], [.5, pick(DOWN), '#ffb4a0'], [.8, 'on-call paged (asleep)', '#ffb4a0'], [1, `${d.name} DOWN`, '#ff4d6d']];
  events.forEach(([f, s, col], i) => {
    const y = 180 + i * 64;
    if (i < events.length - 1) { c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(lx + 4, y + 6, 1, 58); }
    dot(lx + 4.5, y, 4.5, i === events.length - 1 ? '#ff4d6d' : 'rgba(236,235,255,.5)');
    font('400 12px "JetBrains Mono"'); text('T+' + fmtTime(T * f), lx + 20, y + 4, 'rgba(236,235,255,.45)', 'left');
    font('700 13px "JetBrains Mono"'); let t = s; while (c.measureText(t).width > 235) t = t.slice(0, -2) + '…'; text(t, lx + 20, y + 25, col, 'left');
  });

  // right: the status page that never noticed
  const rx = 935, rw = 225;
  font('700 13px "JetBrains Mono"', 3); text('SYSTEM STATUS', rx, 140, '#5dff9b', 'left');
  ['API Gateway', 'Database', 'Auth', 'DNS', 'CDN', d.name].forEach((s, i) => {
    const y = 180 + i * 38;
    font('600 14px "JetBrains Mono"'); let t = s; while (c.measureText(t).width > 112) t = t.slice(0, -2) + '…'; text(t, rx, y, '#ecebff', 'left');
    dot(rx + rw - 4, y - 5, 4, '#5dff9b'); font('600 11px "JetBrains Mono"'); text('Operational', rx + rw - 14, y, '#5dff9b', 'right');
  });
  font('700 11px "JetBrains Mono"', 2); text('UPTIME · 90 DAYS', rx, 432, 'rgba(236,235,255,.5)', 'left');
  for (let i = 0; i < 30; i++) { rr(rx + i * 7.6, 446, 5, 34, 2); c.fillStyle = '#3fd77f'; c.fill(); }
  font('800 22px "JetBrains Mono"'); text('100.00%', rx, 516, '#5dff9b', 'left');
  font('400 12px "JetBrains Mono"'); text('(we checked)', rx + 108, 516, 'rgba(236,235,255,.45)', 'left');

  c.fillStyle = 'rgba(0,0,0,.14)'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
  return cv;
}

let pmUrl = '';
async function sharePostmortem(kind, back) {
  await Promise.all(PM_FONTS.map(f => document.fonts.load(f))).catch(() => { }); await document.fonts.ready;
  const d = postmortemData(kind), blob = await new Promise(r => drawPostmortem(d).toBlob(r, 'image/png'));
  const file = new File([blob], `slop-cannon-incident-${d.lvl}.png`, { type: 'image/png' }), text = `${d.text} ${SITE}`;
  URL.revokeObjectURL(pmUrl); pmUrl = URL.createObjectURL(blob);
  const native = navigator.canShare && navigator.canShare({ files: [file] });
  const copy = () => { navigator.clipboard.writeText(SITE).then(() => toast('link-simple', 'Link copied', SITE, COL.info), () => toast('warning', 'Copy failed', SITE, COL.bad)); return false; };
  modal('Postmortem report', `<img class="pmimg" src="${pmUrl}" alt="Postmortem report card: incident #${d.lvl}, ${d.name} down"><p class="dim">${d.text}</p>`, [
    back ? { label: 'Back', icon: 'arrow-left', onclick: () => { back(); return false; } } : { label: 'Close' },
    { label: 'Copy link', icon: 'link-simple', onclick: copy },
    native ? { label: 'Share image', icon: 'share-network', cls: 'primary', onclick: () => { navigator.share({ files: [file], text }).catch(() => { }); return false; } }
      : { label: 'Post on X', icon: 'x-logo', onclick: () => { open(`https://x.com/intent/post?text=${encodeURIComponent(d.text)}&url=${encodeURIComponent(SITE)}`, '_blank', 'noopener'); return false; } },
    { label: 'Download PNG', icon: 'download-simple', cls: native ? '' : 'primary', onclick: () => { h('a', { href: pmUrl, download: file.name }).click(); return false; } },
  ], { icon: 'clipboard-text', col: COL.bad });
}

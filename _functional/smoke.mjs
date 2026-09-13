// LIGHTKEEPER functional smoke test — drives the LIVE build, asserts gameplay.
// Runs against https://tensorflowyt-eng.github.io/lightkeeper/
import puppeteer from '/root/repos/404-game-recipe/node_modules/puppeteer/lib/puppeteer/puppeteer.js';

const URL = process.env.LK_URL || 'https://tensorflowyt-eng.github.io/lightkeeper/';
const results = [];
const log = (tag, ok, detail = '') => {
  results.push({ tag, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${tag}] ${detail}`);
};

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const consoleErrs = [];
const pageErrors = [];
const req404 = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('response', (r) => { if (r.status() === 404) req404.push(r.url()); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

// A — ready
let ready = false;
const t0 = Date.now();
while (Date.now() - t0 < 40000) {
  ready = await page.evaluate(() => window.__READY__ === true);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 500));
}
log('A ready', ready, `__READY__ in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (!ready) { await browser.close(); process.exit(1); }

// B — start button visible, click, game starts
const startVisible = await page.evaluate(() => {
  const b = document.getElementById('startb');
  const r = b.getBoundingClientRect();
  return b.offsetParent !== null && r.width > 20;
});
await page.click('#startb');
await new Promise((r) => setTimeout(r, 1500));
const started = await page.evaluate(() => ({
  startOff: !document.getElementById('start').classList.contains('on'),
  hudOn: document.getElementById('hud').classList.contains('on'),
}));
log('B start', startVisible && started.startOff && started.hudOn, `startb visible=${startVisible}, start off=${started.startOff}, hud on=${started.hudOn}`);

// C — keyboard throttle moves the boat
const p0 = await page.evaluate(() => window.__GAME__.pos.slice());
await page.keyboard.down('ArrowUp');
await new Promise((r) => setTimeout(r, 3000));
await page.keyboard.up('ArrowUp');
const p1 = await page.evaluate(() => window.__GAME__.pos.slice());
const moved = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
log('C keyboard throttle', moved >= 1, `moved ${moved.toFixed(2)} m in 3 s hold (start ${JSON.stringify(p0)} -> ${JSON.stringify(p1)})`);

// D — oil burns over time
const oilA = await page.evaluate(() => document.getElementById('oilpct').textContent);
await new Promise((r) => setTimeout(r, 10000));
const oilB = await page.evaluate(() => document.getElementById('oilpct').textContent);
const oilBurning = parseInt(oilB) < parseInt(oilA);
log('D oil burn', oilBurning, `oil ${oilA} -> ${oilB} over 10 s`);

// E — GUIDED: ship reaches channel mark with lamp lit (traffic every ~4-11 s, travel 27-38 s)
let guided = 0;
const tGuided = Date.now();
while (Date.now() - tGuided < 60000) {
  guided = await page.evaluate(() => parseInt(document.getElementById('sguided').textContent) || 0);
  if (guided >= 1) break;
  await new Promise((r) => setTimeout(r, 2000));
}
log('E guided ship', guided >= 1, `sguided = "${guided} GUIDED"`);

// J — score increments on a GUIDED ship (read BEFORE restart zeroes it)
const scoreAfterGuided = await page.evaluate(() => window.__GAME__.score);
log('J score increments', scoreAfterGuided >= 10, `__GAME__.score = ${scoreAfterGuided} after a guided ship (expect >= 10)`);

// F — LOST: oil dies at ~87 s (100 / 1.15); a ship arriving in the dark is LOST.
// Ships in flight when the lamp dies travel ~30-60 s more, so the window is long.
let lost = 0, oilPct = 100;
const tLost = Date.now();
while (Date.now() - tLost < 180000) {
  const st = await page.evaluate(() => ({
    lost: parseInt(document.getElementById('slost').textContent) || 0,
    oil: parseInt(document.getElementById('oilpct').textContent) || 0,
  }));
  lost = st.lost; oilPct = st.oil;
  if (lost >= 1) break;
  await new Promise((r) => setTimeout(r, 2000));
}
log('F lost ship (lamp dry)', lost >= 1, `slost = "${lost} LOST" (oil ${oilPct}% when checked)`);

// G — refuel: seek the dock by feedback (sample pos+heading, steer toward it)
async function seekTo(x, z, deadlineMs) {
  const dock = { x, z };
  while (Date.now() < deadlineMs) {
    const g = await page.evaluate(() => window.__GAME__);
    const dx = dock.x - g.pos[0], dz = dock.z - g.pos[1];
    const dist = Math.hypot(dx, dz);
    if (dist < 6) { await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowRight'); return true; }
    const wantH = Math.atan2(dx, dz);
    let dH = wantH - g.heading;
    dH = Math.atan2(Math.sin(dH), Math.cos(dH));
    const want = { ArrowUp: true, ArrowLeft: dH > 0.06, ArrowRight: dH < -0.06 };
    for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowRight']) {
      if (want[k] && !held[k]) { await page.keyboard.down(k); held[k] = true; }
      if (!want[k] && held[k]) { await page.keyboard.up(k); held[k] = false; }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}
const held = {};
let refuelSeen = false, oilAtDock = -1;
const tDock = Date.now();
await seekTo(14, -104, tDock + 45000);
while (Date.now() - tDock < 50000) {
  const st = await page.evaluate(() => ({
    on: document.getElementById('refuel').classList.contains('on'),
    oil: parseInt(document.getElementById('oilpct').textContent) || 0,
  }));
  if (st.on) { refuelSeen = true; oilAtDock = st.oil; break; }
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 1500));
const oilAfter = await page.evaluate(() => parseInt(document.getElementById('oilpct').textContent) || 0);
log('G refuel at dock', refuelSeen && oilAfter > oilAtDock, `refuel indicator on=${refuelSeen}, oil ${oilAtDock}% -> ${oilAfter}% after 1.5 s docked (rate ~26/s expected)`);
await page.keyboard.up('ArrowUp');

// H — horn (Space) triggers without console errors
await page.keyboard.press('Space');
await new Promise((r) => setTimeout(r, 700));
const errsAfterHorn = [...consoleErrs, ...pageErrors];
log('H horn key', errsAfterHorn.length === 0, `console/page errors after Space: ${errsAfterHorn.length}`);

// I — restart (R): counters and oil reset, toast fires
// (oil keeps burning after reset, so assert "back to full-ish", not exactly 100)
await page.keyboard.press('KeyR');
await new Promise((r) => setTimeout(r, 1200));
const rs = await page.evaluate(() => ({
  oil: document.getElementById('oilpct').textContent,
  guided: document.getElementById('sguided').textContent,
  lost: document.getElementById('slost').textContent,
  toast: document.getElementById('toast').textContent,
}));
log('I restart', parseInt(rs.oil) >= 95 && rs.guided === '0 GUIDED' && rs.lost === '0 LOST', `oil=${rs.oil}, guided="${rs.guided}", lost="${rs.lost}", toast="${rs.toast}"`);

// K — hygiene: zero 404s, zero console/page errors overall
log('K hygiene', req404.length === 0 && consoleErrs.length === 0 && pageErrors.length === 0,
  `404s=${req404.length} (${req404.slice(0, 3).join(', ')}), consoleErrs=${consoleErrs.length} (${consoleErrs.slice(0, 3).join(' | ')}), pageErrs=${pageErrors.length} (${pageErrors.slice(0, 3).join(' | ')})`);

await page.screenshot({ path: '/root/repos/lightkeeper/_functional/final.png' });
await browser.close();

const failed = results.filter((r) => !r.ok).map((r) => r.tag);
console.log(`\n=== FUNCTIONAL SMOKE: ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) console.log('failed: ' + failed.join(', '));
process.exit(failed.length ? 1 : 0);

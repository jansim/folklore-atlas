// Measures how hard the page works while it animates, on the globe (turning on its own) and
// zoomed into the flat map: frames the browser managed per second, main-thread time per second
// (script, style, layout; the rest is mostly painting) and, where the page reports it (?perf),
// the time its own drawing code takes per frame.
// Usage: node perf/measure.js [url]   (serve dist/ first: npm run serve)
// DPR=1 for a standard screen (default 2, like a MacBook's).
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:8000/';
const SECONDS = 5;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(process.env.DPR ?? 2) });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');

async function measure(label) {
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await page.evaluate(() => window.frameTimes && (window.frameTimes.length = 0));
  const before = await metrics();
  const frames = await page.evaluate(
    (s) =>
      new Promise((resolve) => {
        let n = 0;
        const end = performance.now() + s * 1000;
        const tick = (t) => (t < end ? (n++, requestAnimationFrame(tick)) : resolve(n));
        requestAnimationFrame(tick);
      }),
    SECONDS,
  );
  const after = await metrics();
  const draws = await page.evaluate(() => window.frameTimes?.slice().sort((a, b) => a - b));
  const per = (k) => (((after[k] - before[k]) / SECONDS) * 1000).toFixed(0).padStart(4);
  const own = draws?.length
    ? ` | draws/s ${(draws.length / SECONDS).toFixed(0).padStart(2)}, ms/draw p50 ${draws[draws.length >> 1].toFixed(1)} p95 ${draws[Math.floor(draws.length * 0.95)].toFixed(1)}`
    : '';
  console.log(
    `${label.padEnd(7)} fps ${(frames / SECONDS).toFixed(0).padStart(3)} | main thread ms/s ${per('TaskDuration')}` +
      ` (script ${per('ScriptDuration')}, style ${per('RecalcStyleDuration')}, layout ${per('LayoutDuration')})${own}`,
  );
}

await page.goto(url.includes('?') ? url : `${url}?perf`);
await page.waitForSelector('#loading', { state: 'hidden' });
await page.waitForTimeout(1500);
await measure('globe');
await page.click('#to-flat');
for (let i = 0; i < 4; i++) await page.click('#zoom-in'), await page.waitForTimeout(550);
await page.waitForTimeout(1000);
await measure('zoomed');
await browser.close();

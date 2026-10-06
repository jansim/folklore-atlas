// CPU profile of the turning globe: the functions with the most self time.
// Usage: node perf/profile.js [url]   (serve an unminified build: npm run dev)
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:8000/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const cdp = await page.context().newCDPSession(page);
await page.goto(url);
await page.waitForSelector('#loading', { state: 'hidden' });
await page.waitForTimeout(1500);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
await page.waitForTimeout(4000);
const { profile } = await cdp.send('Profiler.stop');
const self = new Map();
const dt = profile.timeDeltas;
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
profile.samples.forEach((id, i) => {
  const n = byId.get(id);
  const key = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
  self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
});
const total = [...self.values()].reduce((a, b) => a + b, 0);
for (const [k, ms] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`${((ms / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
await browser.close();

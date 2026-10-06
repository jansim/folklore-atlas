#!/usr/bin/env node
// Bundles the site from src/ into dist/ with esbuild: src/main.js (and the npm packages it
// imports) -> dist/app.js, src/style.css -> dist/style.css, src/index.html copied as is.
// The data in dist/data/ comes from scripts/build-world.js and scripts/build-data.js.
//
// Usage: node scripts/build-site.js [--watch] [--serve [port]]

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { DIST, ROOT } from './paths.js';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const serveAt = args.indexOf('--serve');
const port = serveAt >= 0 && /^\d+$/.test(args[serveAt + 1] ?? '') ? Number(args[serveAt + 1]) : 8000;

const copyHtml = {
  name: 'copy-html',
  setup(build) {
    build.onEnd(() => fs.copyFileSync(path.join(ROOT, 'src/index.html'), path.join(DIST, 'index.html')));
  },
};

const ctx = await esbuild.context({
  entryPoints: { app: path.join(ROOT, 'src/main.js'), style: path.join(ROOT, 'src/style.css') },
  outdir: DIST,
  bundle: true,
  minify: !watch,
  sourcemap: true,
  format: 'iife',
  target: ['es2020'],
  logLevel: 'info',
  plugins: [copyHtml],
});

if (watch) await ctx.watch();
else await ctx.rebuild();

if (serveAt >= 0) {
  if (!fs.existsSync(path.join(DIST, 'data/map.json'))) console.warn('dist/data/ is missing: run npm run build first.');
  const { hosts } = await ctx.serve({ servedir: DIST, port });
  console.log(`Serving dist/ at http://${hosts[0] === '0.0.0.0' ? 'localhost' : hosts[0]}:${port}`);
} else if (!watch) await ctx.dispose();

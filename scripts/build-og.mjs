#!/usr/bin/env node
/**
 * Build the social preview image (Open Graph / Twitter card) at
 * `og.png` — 1200×630, the size every major social platform crops to.
 *
 * The site is pure static HTML with no node_modules of its own. To
 * run this script, point Node at a directory where `@playwright/test`
 * is already installed — typically the sibling `sheet/` or
 * `document/docx-editor/` repos. Example:
 *
 *   cd ../sheet && node ../site/scripts/build-og.mjs
 *
 * Or `npx playwright@latest` if you want a one-shot install.
 *
 * Re-run whenever the messaging changes. The PNG is committed so
 * the GitHub Pages deploy doesn't need any build step.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
mkdirSync(SITE_ROOT, { recursive: true });

const html = /* html */ `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  :root {
    --accent: #217346;
    --accent-2: #2563eb;
    --accent-3: #7c3aed;
    --bg: #fafaf7;
    --fg: #0f172a;
    --muted: #475569;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 1200px;
    height: 630px;
    background: var(--bg);
    color: var(--fg);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 64px 72px;
  }
  .aurora {
    position: absolute; inset: -10%;
    background:
      radial-gradient(900px circle at 8% 8%, rgba(33, 115, 70, 0.28), transparent 60%),
      radial-gradient(800px circle at 50% 50%, rgba(37, 99, 235, 0.22), transparent 60%),
      radial-gradient(800px circle at 95% 92%, rgba(124, 58, 237, 0.22), transparent 60%);
    filter: blur(20px);
    pointer-events: none;
  }
  .topline { display: flex; align-items: center; gap: 14px; position: relative; z-index: 1; }
  .brand-mark {
    width: 56px; height: 56px;
    border-radius: 14px;
    background: linear-gradient(135deg, var(--accent), var(--accent-2), var(--accent-3));
    display: inline-flex; align-items: center; justify-content: center;
    color: #fff;
    box-shadow: 0 8px 24px rgba(33, 115, 70, 0.22);
    font-weight: 700;
    font-size: 22px;
    letter-spacing: -0.02em;
  }
  .brand { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
  .domain { font-size: 16px; color: var(--muted); margin-left: auto; font-weight: 500; }

  .main { position: relative; z-index: 1; max-width: 1020px; }
  h1 {
    font-size: 80px; font-weight: 800; line-height: 1.02; margin: 0 0 18px;
    letter-spacing: -0.025em;
    background: linear-gradient(135deg, #0f172a 0%, var(--accent) 60%, var(--accent-3) 110%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  p.tagline {
    font-size: 26px; line-height: 1.36; margin: 0 0 28px; color: var(--muted);
    max-width: 980px;
    font-weight: 500;
  }

  .products {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-top: 6px;
  }
  .product {
    padding: 14px 16px;
    border-radius: 12px;
    background: rgba(255,255,255,0.78);
    border: 1px solid rgba(15, 23, 42, 0.06);
    backdrop-filter: blur(8px);
  }
  .product__dot {
    display: inline-block;
    width: 10px; height: 10px;
    border-radius: 50%;
    margin-right: 8px;
    vertical-align: middle;
  }
  .product__dot--sheet { background: var(--accent); }
  .product__dot--editor { background: var(--accent-2); }
  .product__dot--desktop { background: var(--accent-3); }
  .product__name { font-weight: 700; font-size: 18px; }
  .product__sub { font-size: 13px; color: var(--muted); margin-top: 2px; }

  .foot {
    position: relative; z-index: 1;
    display: flex; align-items: center; justify-content: space-between;
    color: var(--muted); font-size: 16px;
    font-weight: 500;
  }
  .foot .badges { display: flex; gap: 14px; }
  .foot .badge {
    padding: 6px 12px;
    background: rgba(15, 23, 42, 0.06);
    border-radius: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    color: var(--fg);
  }
</style>
</head>
<body>
  <div class="aurora"></div>

  <div class="topline">
    <span class="brand-mark" aria-hidden="true">cs</span>
    <span class="brand">Casual Office</span>
    <span class="domain">schnsrw.live</span>
  </div>

  <div class="main">
    <h1>Office, for the open web.</h1>
    <p class="tagline">Real-time, file-centric, self-hostable. Sheets, Editor, and a desktop binary that ships when both web cores hit 90% fidelity.</p>
    <div class="products">
      <div class="product">
        <div><span class="product__dot product__dot--sheet"></span><span class="product__name">Casual Sheets</span></div>
        <div class="product__sub">.xlsx · pivots · charts · co-edit</div>
      </div>
      <div class="product">
        <div><span class="product__dot product__dot--editor"></span><span class="product__name">Casual Editor</span></div>
        <div class="product__sub">.docx · ProseMirror · Go gateway</div>
      </div>
      <div class="product">
        <div><span class="product__dot product__dot--desktop"></span><span class="product__name">Casual Desktop</span></div>
        <div class="product__sub">Tauri · offline · in progress</div>
      </div>
    </div>
  </div>

  <div class="foot">
    <span>by Sachin Sarwa · open source · Apache-2.0 / MIT</span>
    <span class="badges">
      <span class="badge">github.com/schnsrw</span>
    </span>
  </div>
</body>
</html>
`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
const png = await page.screenshot({ type: 'png', omitBackground: false });
await browser.close();

const outPath = resolve(SITE_ROOT, 'og.png');
writeFileSync(outPath, png);
console.info(`✓ ${outPath} (${(png.byteLength / 1024).toFixed(1)} KB)`);

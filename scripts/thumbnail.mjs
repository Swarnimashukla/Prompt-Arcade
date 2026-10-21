// Renders the share card at a few landscape sizes.
//
//   npm i --no-save playwright
//   node scripts/thumbnail.mjs [outDir]
//
// Playwright is deliberately NOT a dependency in package.json: Netlify
// installs devDependencies on every build, and a browser download on
// every deploy is a steep price for a script that runs when the brand
// changes. Install it for the run and let it go.
//
// The card is built from the product's own tokens and artwork rather
// than drawn separately, so regenerating it after a brand change is a
// command rather than a design job. Output is PNG at 2x.

import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { resolve, join } from 'path';
import { pathToFileURL } from 'url';

const CARD = resolve('scripts/thumbnail/card.html');
const OUT = resolve(process.argv[2] || 'scripts/thumbnail/out');

// Type scales with the card, so one layout serves every ratio.
const SIZES = [
  { name: 'promptarcade-card-1200x630', w: 1200, h: 630,  h1: 72,  stamp: 17, mark: 17 },  // OG / portfolio card
  { name: 'promptarcade-card-1600x900', w: 1600, h: 900,  h1: 94,  stamp: 22, mark: 22 },  // 16:9
  { name: 'promptarcade-card-2400x1260', w: 2400, h: 1260, h1: 144, stamp: 34, mark: 34 }  // 1.91:1, double size
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox']
});

await mkdir(OUT, { recursive: true });

for (const s of SIZES) {
  const page = await browser.newPage({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: 2
  });
  await page.goto(pathToFileURL(CARD).href, { waitUntil: 'load' });
  await page.evaluate(({ h1, stamp, mark }) => {
    document.documentElement.style.setProperty('--h1', h1 + 'px');
    document.documentElement.style.setProperty('--stamp', stamp + 'px');
    document.documentElement.style.setProperty('--mark', mark + 'px');
  }, s);
  // Both faces are local, but waiting avoids a race on a cold cache.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);

  const used = await page.evaluate(() => {
    const h1 = getComputedStyle(document.querySelector('h1')).fontFamily;
    return { h1, loaded: [...document.fonts].map(f => f.family + ':' + f.status).join(', ') };
  });
  if (!/Fredoka/.test(used.h1) || /unloaded/.test(used.loaded)) {
    throw new Error('Brand fonts did not load: ' + JSON.stringify(used));
  }

  const file = join(OUT, s.name + '.png');
  await page.screenshot({ path: file });
  console.log(`${s.name}.png  ${s.w}x${s.h} @2x  →  ${s.w * 2}x${s.h * 2}`);
  await page.close();
}

await browser.close();
console.log(`\nWritten to ${OUT}`);

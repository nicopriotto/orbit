import { createRequire } from 'node:module';
const require = createRequire('/Users/nicolaspriotto/proyects/clothes/hackathon-meta/video/x.js');
const { chromium } = require('playwright');
const HERE = '/private/tmp/claude-501/-Users-nicolaspriotto-proyects-clothes/09261622-20ca-4ae3-9e14-0267aed9fc8a/scratchpad';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 806 } })).newPage();
const posts = [];
page.on('request', (r) => { if (r.url().includes('/api/') && r.method() === 'POST') posts.push(r.url()); });
await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const clip = { x: 520, y: 20, width: 400, height: 680 };
const look = () => page.evaluate(() => {
  const f = [...document.querySelectorAll('.frame')].sort((a, b) => b.style.opacity - a.style.opacity)[0];
  return `${f.getAttribute('src').split('/').pop()}${f.style.transform ? ' mirrored' : ''}`;
});
const walk = async (id, name) => {
  const seen = [];
  for (let i = 0; i < 6; i++) {
    await page.click(id, { force: true });
    await page.waitForTimeout(1500);
    seen.push(await look());
    await page.screenshot({ path: `${HERE}/views/${name}${i}.png`, clip });
  }
  console.log(name, seen.join(' | '));
};
await walk('#turn-left', 'L');
await walk('#turn-right', 'R');
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(1500);
console.log('key left', await look());
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(1500);

await page.click('#wardrobe-rail');
await page.waitForTimeout(700);
await page.evaluate(() => { document.getElementById('wardrobe').scrollTop = 300; });
let bad = 0;
const names = new Set();
for (let i = 0; i < 25; i++) {
  await page.click('#surprise');
  await page.waitForTimeout(90);
  const list = await page.textContent('#pieces');
  names.add(list);
  const hasDress = /dress|midi/i.test(list);
  const hasLegs = /jeans|chinos|trouser|pant/i.test(list);
  if (!hasDress && !hasLegs) { bad += 1; console.log('half dressed', list); }
}
console.log('surprise', names.size, 'different, half dressed:', bad, 'scrollTop', await page.evaluate(() => document.getElementById('wardrobe').scrollTop), 'posts', posts.length);
await page.click('#wardrobe-close');
await page.waitForTimeout(700);
await page.click('#places button:nth-child(3)');
await page.waitForTimeout(700);
await page.screenshot({ path: `${HERE}/shot-places.png`, clip: { x: 1040, y: 0, width: 400, height: 110 } });
await browser.close();

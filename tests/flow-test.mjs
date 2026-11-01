// Walks the app in headless Chromium. api/try-on is answered by a stream held in the page, so nothing is billed.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire('/Users/nicolaspriotto/proyects/clothes/hackathon-meta/video/x.js');
const { chromium } = require('playwright');
const HERE = '/private/tmp/claude-501/-Users-nicolaspriotto-proyects-clothes/09261622-20ca-4ae3-9e14-0267aed9fc8a/scratchpad';
const PHOTO = '/Users/nicolaspriotto/proyects/clothes/hackathon-meta/modelo-demo.jpg';
const RESULT = `${HERE}/tryon/dress-black-none`;
const front = readFileSync(`${RESULT}-front.webp`).toString('base64');
const back = readFileSync(`${RESULT}-back.webp`).toString('base64');

const browser = await chromium.launch();
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(ok ? 'ok  ' : 'FAIL', name, extra); };

async function open(viewport, mode) {
  const page = await (await browser.newContext({ viewport })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.exposeFunction('stubParts', () => ({ front, back }));
  await page.addInitScript((m) => {
    window.__posts = [];
    const real = window.fetch;
    window.fetch = async (url, options) => {
      if (!String(url).includes('api/try-on')) return real(url, options);
      window.__posts.push(url);
      const parts = await window.stubParts();
      const stream = new ReadableStream({
        start(controller) {
          const encode = (o) => controller.enqueue(new TextEncoder().encode(`${JSON.stringify(o)}\n`));
          window.__sendFront = () => encode({ front: parts.front });
          window.__sendBack = () => { if (m !== 'fail') encode({ back: parts.back }); controller.close(); };
        },
      });
      return new Response(stream, { status: 200 });
    };
  }, mode);
  await page.route('**/api/looks', (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
  await page.goto('http://localhost:5192/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  return { page, errors };
}

const shown = (page, id) => page.locator(`#${id}`).isVisible();
const upload = async (page) => {
  await page.click('#try');
  await page.setInputFiles('#upload-file', PHOTO);
  await page.waitForFunction(() => !document.getElementById('upload-preview').hidden);
  await page.check('#upload-consent');
  await page.click('#upload-send');
  await page.waitForFunction(() => window.__sendFront);
};

{
  const { page, errors } = await open({ width: 1440, height: 806 });
  check('opens dressed', (await page.locator('#frame-a').getAttribute('src')).includes('jacket-chinos'));
  check('try enabled at start', await page.locator('#try').isEnabled());
  check('total shown', (await page.textContent('#total')) === '$298', await page.textContent('#total'));
  check('shop in panel', await shown(page, 'shop'));
  check('rail shown, dock button not', (await shown(page, 'wardrobe-rail')) && !(await shown(page, 'open-wardrobe')));
  check('no new look label', !(await page.locator('.piece em').allTextContents()).some((t) => t.includes('New')));
  await page.screenshot({ path: `${HERE}/shot-open.png` });
  await page.hover('#wardrobe-rail');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${HERE}/shot-rail-hover.png` });
  await page.click('#wardrobe-rail');
  await page.waitForTimeout(700);
  check('rail opens wardrobe', await page.locator('body').evaluate((b) => b.hasAttribute('data-wardrobe')));
  check('no look panel in wardrobe', !(await shown(page, 'tag')));
  check('no rooms in wardrobe', !(await page.locator('#places').isVisible()));
  check('rooms have no hover name', (await page.locator('.place[title]').count()) === 0);
  await page.screenshot({ path: `${HERE}/shot-wardrobe-wide.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  check('esc closes wardrobe', !(await page.locator('body').evaluate((b) => b.hasAttribute('data-wardrobe'))));
  await page.screenshot({ path: `${HERE}/shot-open.png` });

  await page.click('#shop');
  await page.waitForTimeout(350);
  check('store shows the cart', (await shown(page, 'store-cart')) && (await page.locator('#store-list li').count()) === 4);
  check('store total', (await page.textContent('#store-total')) === '$298');
  await page.screenshot({ path: `${HERE}/shot-store.png` });
  await page.click('#store-checkout');
  await page.waitForTimeout(150);
  check('checkout hands off', await shown(page, 'store-done'));
  await page.screenshot({ path: `${HERE}/shot-store-done.png` });
  await page.click('#store-back');
  check('store closes', !(await page.locator('#store').evaluate((d) => d.open)));

  await upload(page);
  await page.waitForTimeout(400);
  check('loader up before front', await shown(page, 'loader'));
  await page.evaluate(() => window.__sendFront());
  await page.waitForFunction(() => !document.getElementById('leave').hidden);
  await page.waitForTimeout(900);
  check('front on figure', (await page.locator('#frame-a').getAttribute('src')).startsWith('data:image/webp'));
  check('loader gone', !(await shown(page, 'loader')));
  check('turn locked until back', await page.locator('#turn-right').isDisabled());
  check('back note shown', (await page.textContent('#working-text')) === 'Muse is making the back');
  check('dock swaps to shop and leave', (await shown(page, 'shop-worn')) && (await shown(page, 'leave')));
  check('panel shop hidden while worn', !(await shown(page, 'shop')));
  await page.screenshot({ path: `${HERE}/shot-print-early.png` });
  await page.waitForTimeout(3600);
  check('print appears on its own', await shown(page, 'snap'));
  await page.screenshot({ path: `${HERE}/shot-front.png` });
  await page.click('#places button:nth-child(4)');
  await page.waitForTimeout(800);
  await page.click('#snap');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${HERE}/shot-print-view.png` });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#snap-save')]);
  await download.saveAs(`${HERE}/print.jpg`);
  check('download named', download.suggestedFilename() === 'orbit-look.jpg', download.suggestedFilename());
  await page.click('#snap-close');
  await page.click('#places button:nth-child(1)');
  await page.waitForTimeout(400);

  await page.click('#shop-worn');
  await page.waitForTimeout(100);
  check('store opens during try-on', await page.locator('#store').evaluate((d) => d.open));
  await page.click('#store-close');
  check('back note stays', (await page.textContent('#working-text')) === 'Muse is making the back');

  await page.evaluate(() => window.__sendBack());
  await page.waitForFunction(() => !document.getElementById('turn-right').disabled);
  await page.waitForTimeout(300);
  check('note clears with back', await page.locator('#working').isHidden());
  await page.click('#turn-right');
  await page.waitForTimeout(1600);
  const sources = await page.evaluate(() => [...document.querySelectorAll('#frame-a,#frame-b')].map((i) => i.src.length));
  check('turned to back', sources.every((n) => n > 1000));
  await page.screenshot({ path: `${HERE}/shot-back.png` });

  await page.click('#leave');
  await page.waitForTimeout(700);
  check('back to mannequin restores dock', (await shown(page, 'try')) && (await shown(page, 'shop')) && !(await shown(page, 'snap')));
  await page.click('#try');
  await page.waitForFunction(() => !document.getElementById('leave').hidden);
  check('second wear is cached, no second call', (await page.evaluate(() => window.__posts.length)) === 1);
  check('no page errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

{
  // Leaves while the back is still coming, then finds it finished.
  const { page } = await open({ width: 1440, height: 806 });
  await upload(page);
  await page.evaluate(() => window.__sendFront());
  await page.waitForFunction(() => !document.getElementById('leave').hidden);
  await page.waitForTimeout(600);
  await page.click('#leave');
  await page.waitForTimeout(500);
  check('leaving frees the arrows', await page.locator('#turn-right').isEnabled());
  check('leaving clears the note', await page.locator('#working').isHidden());
  await page.evaluate(() => window.__sendBack());
  await page.waitForTimeout(300);
  await page.click('#try');
  await page.waitForFunction(() => !document.getElementById('leave').hidden);
  await page.waitForTimeout(600);
  check('finished back is there on return', await page.locator('#turn-right').isEnabled());
  check('one call only', (await page.evaluate(() => window.__posts.length)) === 1);
  await page.close();
}

{
  const { page } = await open({ width: 1440, height: 806 }, 'fail');
  await upload(page);
  await page.evaluate(() => window.__sendFront());
  await page.waitForFunction(() => !document.getElementById('leave').hidden);
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__sendBack());
  await page.waitForTimeout(300);
  check('failed back is said', (await page.textContent('#working-text')) === 'The back did not come through');
  check('failed back stays front only', await page.locator('#turn-right').isDisabled());
  await page.click('#leave');
  await page.waitForTimeout(500);
  await page.click('#try');
  await page.waitForTimeout(300);
  check('failed try-on can be retried', (await page.evaluate(() => window.__posts.length)) === 2);
  await page.close();
}

{
  const { page } = await open({ width: 390, height: 844 });
  await page.screenshot({ path: `${HERE}/shot-phone.png` });
  await page.click('#open-wardrobe');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${HERE}/shot-phone-wardrobe.png` });
  await page.click('#wardrobe-close');
  await page.waitForTimeout(700);
  await upload(page);
  await page.evaluate(() => window.__sendFront());
  await page.waitForFunction(() => !document.getElementById('leave').hidden);
  await page.waitForTimeout(4200);
  await page.screenshot({ path: `${HERE}/shot-phone-worn.png` });
  await page.click('#shop-worn');
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${HERE}/shot-phone-store.png` });
  await page.close();
}

{
  const { page } = await open({ width: 1100, height: 700 });
  await page.screenshot({ path: `${HERE}/shot-narrow.png` });
  await page.click('#wardrobe-rail');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${HERE}/shot-wardrobe.png` });
  await page.close();
}

await browser.close();
console.log(results.every(Boolean) ? 'ALL OK' : 'SOME FAILED');

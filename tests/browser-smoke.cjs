/* Optional development-only check using an externally installed Playwright. */
'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
(async () => {
  const server = require('node:http').createServer((req,res) => {
    const target=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if (!target.startsWith(root+path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(target,(error,body)=>{ res.writeHead(error?404:200,{'Content-Type':target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':'text/html'}); res.end(error?'Not found':body); });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=process.env.BROWSER_FILE_URL ? pathToFileURL(path.join(root,'index.html')).href : `http://127.0.0.1:${server.address().port}/index.html`;
  let browser;
  try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Tokyo' });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const fixture=sessionStorage.getItem('test-fixture');
      if(fixture!==null) { sessionStorage.removeItem('test-fixture'); localStorage.setItem('ai-life-companion.v1',fixture); }
    });
    await page.goto(url); await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('保存済み'));
    assert.equal(await page.locator('#snack-choice option').count(),10);
    for (const value of await page.locator('#snack-choice option').evaluateAll(xs => xs.map(x => x.value))) {
      await page.selectOption('#snack-choice',value); await page.click('#give-snack');
      assert((await page.locator('#gift-reply').textContent()).includes('もらった'));
    }
    await page.locator('.quick-questions button').first().click(); assert(await page.locator('#chat-log .companion').count() > 0);
    await page.click('#open-diary'); assert(await page.locator('#diary-dialog').evaluate(el => el.open)); await page.click('#close-diary');
    await page.click('#debug-toggle'); await page.click('#advance-week'); assert((await page.locator('#debug-result').textContent()).includes('7日進めました'));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(Life.STORAGE_KEY)));
    await page.reload(); const reloaded = await page.evaluate(() => JSON.parse(localStorage.getItem(Life.STORAGE_KEY)));
    assert.deepEqual(reloaded.inventory,saved.inventory); assert.equal(reloaded.rngState,saved.rngState);
    await page.screenshot({ path: '/tmp/ai-life-desktop.png', fullPage: true });
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: '/tmp/ai-life-mobile.png', fullPage: true });
    const legacy=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/v1-world.json'),'utf8'));
    await page.evaluate(w => { sessionStorage.setItem('test-fixture',JSON.stringify(w)); },legacy);
    await page.reload();
    const migrated=await page.evaluate(()=>JSON.parse(localStorage.getItem(Life.STORAGE_KEY)));
    assert.equal(migrated.schemaVersion,2); assert.equal(migrated.character.name,legacy.character.name);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(Life.STORAGE_KEY+'.backup-v1')).schemaVersion),1);
    await page.evaluate(()=>sessionStorage.setItem('test-fixture','{broken')); await page.reload();
    assert((await page.locator('#save-status').textContent()).includes('一時的な部屋'));
    assert.equal(await page.evaluate(()=>localStorage.getItem(Life.STORAGE_KEY)),'{broken');
    await page.click('#debug-toggle'); page.once('dialog',d=>d.accept()); await page.click('#reset-world');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(Life.STORAGE_KEY)).schemaVersion),2);
    await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:Life.STORAGE_KEY,newValue:'{}'})));
    assert(await page.locator('#give-snack').isDisabled());
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('PASS browser: local HTTP boot, 10 snacks, chat, diary, 7-day advance, reload, mobile layout, v1 migration, corruption/reset, multi-tab stop; zero page errors');
    await context.close();
  } finally { if(browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{console.error(e);process.exitCode=1;});

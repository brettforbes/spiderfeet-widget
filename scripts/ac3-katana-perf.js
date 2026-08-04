#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

async function main() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch {
    require('child_process').execSync('npm install --no-save puppeteer-core@22', {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });
    puppeteer = require('puppeteer-core');
  }

  const fixtureSrc = path.resolve(
    __dirname,
    '../../spiderfeet/.docs/docs-for-cli-tools/nugget_structure/katana_from_httpx_upside_com_proposed_nuggets_edges.json'
  );
  const dist = path.join(__dirname, '../dist');
  fs.mkdirSync(path.join(dist, 'fixtures'), { recursive: true });
  fs.copyFileSync(fixtureSrc, path.join(dist, 'fixtures/katana_from_httpx_upside_com_proposed_nuggets_edges.json'));
  fs.copyFileSync(
    path.join(__dirname, 'ac3-katana-perf.html'),
    path.join(dist, 'ac3-katana-perf.html')
  );

  const chromePath =
    process.env.CHROME_PATH ||
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    await page.goto('http://127.0.0.1:4173/ac3-katana-perf.html', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForFunction(() => window.__ready === true || /AC3 FAIL/.test(document.body.innerText), {
      timeout: 120000,
    });
    const failText = await page.evaluate(() => document.body.innerText);
    if (/AC3 FAIL/.test(failText) && !windowReady(failText)) {
      console.log(failText);
      process.exit(1);
    }
    function windowReady(t) {
      return /AC3 READY/.test(t);
    }
    if (!/AC3 READY/.test(failText) && !(await page.evaluate(() => window.__ready === true))) {
      console.log(failText);
      process.exit(1);
    }
    const timing = await page.evaluate(() => window.__timing);
    const panStart = Date.now();
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(480, 360, { steps: 8 });
    await page.mouse.up();
    timing.panGestureMs = Date.now() - panStart;
    console.log(JSON.stringify(timing, null, 2));
    if (!timing.usingWorker) {
      console.log('AC3 FAIL: worker not used (expected usingWorker=true on http origin)');
      process.exit(1);
    }
    if (timing.mountToFirstFrameMs > 2000) {
      console.log('AC3 WARN: first frame slower than 2s');
    }
    console.log('AC3 VERIFY PASS');
    await page.evaluate(() => window.__api && window.__api.destroy());
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

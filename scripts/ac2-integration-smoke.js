#!/usr/bin/env node
'use strict';
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
  const chromePath =
    process.env.CHROME_PATH ||
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const url = process.argv[2] || 'http://127.0.0.1:4173/ac2-integration-smoke.html';
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    page.on('console', (msg) => console.log('console:', msg.text()));
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(
      () => document.body && /AC2 VERIFY (PASS|FAIL)/.test(document.body.innerText),
      { timeout: 30000 }
    );
    const text = await page.evaluate(() => document.body.innerText);
    console.log(text);
    if (!/AC2 VERIFY PASS/.test(text)) process.exit(1);
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

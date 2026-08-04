#!/usr/bin/env node
/** AC1: launch system Chrome via puppeteer-core and verify worker ticks. */
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

async function main() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch {
    console.error('Installing puppeteer-core…');
    require('child_process').execSync('npm install --no-save puppeteer-core@22', {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });
    puppeteer = require('puppeteer-core');
  }

  const chromePath =
    process.env.CHROME_PATH ||
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const url = process.argv[2] || 'http://127.0.0.1:4173/workers/ac1-worker-smoke.html';

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    page.on('console', (msg) => console.log('console:', msg.text()));
    page.on('pageerror', (err) => console.error('pageerror:', err.message));
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction(
      () => document.body && /AC1 VERIFY (PASS|FAIL)/.test(document.body.innerText),
      { timeout: 20000 }
    );
    const text = await page.evaluate(() => document.body.innerText);
    console.log(text);
    if (!/AC1 VERIFY PASS/.test(text)) process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

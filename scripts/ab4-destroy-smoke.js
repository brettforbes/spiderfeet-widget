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
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<!DOCTYPE html><html><body>
      <div id="stage" style="width:800px;height:500px"><canvas id="cg"></canvas></div>
      <pre id="out"></pre>
      <script src="http://127.0.0.1:4173/vendor.js"><\/script>
      <script src="http://127.0.0.1:4173/widget.js"><\/script>
      <script>
        (async function () {
          const nodes = [{ id: 'a', group: 'entity', r: 8, x: 100, y: 100 }];
          for (let i = 0; i < 10; i++) {
            const api = Viz.CanvasGraph.create({
              canvas: '#cg',
              nodes: nodes.map((n) => ({ ...n })),
              links: [],
            });
            await new Promise((r) => setTimeout(r, 40));
            api.destroy();
          }
          document.getElementById('out').textContent = 'AB4 VERIFY PASS';
        })().catch((e) => {
          document.getElementById('out').textContent = 'AB4 VERIFY FAIL: ' + e.message;
        });
      <\/script>
    </body></html>`,
      { waitUntil: 'networkidle0', timeout: 60000 }
    );
    await page.waitForFunction(
      () => /AB4 VERIFY (PASS|FAIL)/.test(document.body.innerText),
      { timeout: 20000 }
    );
    const text = await page.evaluate(() => document.body.innerText);
    console.log(text);
    if (!/AB4 VERIFY PASS/.test(text)) process.exit(1);
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

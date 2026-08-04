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
    await page.setContent(`<!DOCTYPE html><html><body>
      <div id="stage" style="width:800px;height:500px;position:relative">
        <canvas id="cg"></canvas>
        <div id="tip" hidden style="position:absolute"></div>
      </div>
      <pre id="out"></pre>
      <script src="http://127.0.0.1:4173/vendor.js"><\/script>
      <script src="http://127.0.0.1:4173/widget.js"><\/script>
      <script>
        window.__clicks = 0;
        const nodes = []; const links = [];
        for (let i = 0; i < 8; i++) {
          nodes.push({ id: 'n'+i, group: 'entity', colour: '#38bdf8', r: 14, label: 'n'+i, x: 200+i*50, y: 250 });
          if (i) links.push({ source: 'n'+(i-1), target: 'n'+i, role: 'had' });
        }
        const api = Viz.CanvasGraph.create({
          canvas: '#cg', tooltip: '#tip', nodes, links, forceMainThread: true,
          onNodeClick: () => { window.__clicks++; }
        });
        window.__api = api;
        document.getElementById('out').textContent = 'ready';
      <\/script>
    </body></html>`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => document.getElementById('out')?.textContent === 'ready');
    await new Promise((r) => setTimeout(r, 200));
    const target = await page.evaluate(() => {
      const n = window.__api.nodes.find((x) => x.id === 'n0');
      const canvas = document.getElementById('cg');
      const r = canvas.getBoundingClientRect();
      const t = window.__api.getTransform();
      return {
        clientX: r.left + t.applyX(n.x),
        clientY: r.top + t.applyY(n.y),
      };
    });
    await page.mouse.click(target.clientX, target.clientY);
    await new Promise((r) => setTimeout(r, 200));
    const clicks = await page.evaluate(() => window.__clicks);
    const pinned = await page.evaluate(() => {
      const api = window.__api;
      api.pinNode('n0', 210, 260);
      return api.nodes.find((n) => n.id === 'n0')?.pinned === true;
    });
    console.log('clicks=', clicks, 'pinWorks=', pinned);
    if (clicks < 1 || !pinned) {
      console.log('AB3 VERIFY FAIL');
      process.exit(1);
    }
    console.log('AB3 VERIFY PASS');
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

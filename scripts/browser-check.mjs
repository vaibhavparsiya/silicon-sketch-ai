import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { chromium } from 'playwright-core';
import axe from 'axe-core';

const scratch = await mkdtemp(join(tmpdir(), 'silicon-browser-'));
const env = {
  ...process.env,
  HOST: '127.0.0.1',
  PORT: '0',
  PUBLIC_ORIGIN: '',
  GEMINI_API_KEY: '',
  GROQ_API_KEY: '',
};
const dev = spawn(process.execPath, [fileURLToPath(new URL('./dev.mjs', import.meta.url))], {
  cwd: scratch,
  env,
  stdio: ['ignore', 'pipe', 'inherit'],
});
let browser;
try {
  const [ready] = await Promise.race([
    once(dev.stdout, 'data'),
    once(dev, 'exit').then(() => {
      throw Error('Server exited before startup.');
    }),
  ]);
  const base = 'http://127.0.0.1:' + ready.toString().match(/port (\d+)/)[1];
  const executablePath =
    process.env.CHROMIUM_PATH || [chromium.executablePath(), '/usr/bin/chromium'].find(existsSync);
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage(),
    errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  async function audit(label) {
    await page.evaluate(axe.source);
    const result = await page.evaluate(async () =>
      window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      }),
    );
    const faults = result.violations.map((rule) => ({
      id: rule.id,
      targets: rule.nodes.map((n) => n.target),
    }));
    assert.deepEqual(faults, [], label + ': ' + JSON.stringify(faults));
    console.log(label + ' · 0 axe violations');
  }
  for (const [route, ready] of [
    ['/', '#cell0'],
    ['/sequence', '#scope button'],
    ['/rtl', '#inputs button'],
  ]) {
    await page.goto(base + route);
    await page.locator(ready).first().waitFor();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').textContent(), 'Skip to main content');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'main-content');
    await audit(route + ' at desktop width');
    if (route === '/') {
      await page.locator('#sw0').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#sw0').getAttribute('aria-pressed'), 'true');
      await page.locator('#cell3').click();
      await page.locator('#inject').click();
      assert.ok(await page.locator('#fault').textContent());
      await page.locator('#save').click();
      const link = page.locator('#shared a');
      await link.waitFor();
      const target = await link.getAttribute('href');
      assert.match(target, /design=[a-f0-9]{32}$/);
      const state = await page.locator('#state').textContent();
      await page.goto(target);
      await page.waitForFunction(() =>
        document.getElementById('msg').textContent.includes('review'),
      );
      assert.equal(await page.locator('#state').textContent(), state);
    } else if (route === '/sequence') {
      await page.getByLabel('Inspect clock 3', { exact: true }).press('Enter');
      assert.equal(await page.locator('#cycle').textContent(), 'Clock 3');
      await page.getByLabel('After a match').selectOption('restart');
      await page.getByRole('button', { name: 'Build detector' }).click();
      assert.match(await page.locator('#score').textContent(), /1 match/);
    } else {
      await page.locator('[data-gate="0"]').focus();
      await page.keyboard.press('Space');
      assert.equal(await page.locator(':focus').getAttribute('data-gate'), '0');
      await page.locator('#examples').selectOption('alu');
      await page.locator('#vectors button').first().click();
      assert.match(await page.locator('#vector-report').textContent(), /pass/);
      await page.locator('#view').selectOption('die');
      await page.locator('#die').waitFor();
      await audit('RTL physical view');
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await audit(route + ' at mobile width');
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'page overflows at mobile width ' +
        route +
        ' ' +
        (await page.evaluate(() =>
          JSON.stringify(
            [...document.querySelectorAll('main *, header *')]
              .filter(
                (el) =>
                  el.getBoundingClientRect().right > innerWidth &&
                  !el.closest('svg,#scope,#diagram'),
              )
              .slice(0, 15)
              .map((el) => [
                el.tagName,
                el.id || el.className,
                Math.round(el.getBoundingClientRect().right),
              ]),
          ),
        )),
    );
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  // Use the exact npm package declared in the lockfile. The worker still verifies its SHA-512.
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const runtime = lock.packages['node_modules/@yowasp/yosys'];
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const packed = JSON.parse(
    execFileSync(
      npm,
      [
        'pack',
        '--json',
        '--prefer-offline',
        '--ignore-scripts',
        '--pack-destination',
        scratch,
        '@yowasp/yosys@' + runtime.version,
      ],
      { encoding: 'utf8', shell: process.platform === 'win32' },
    ),
  )[0];
  await page.context().route(runtime.resolved, (route) =>
    route.fulfill({
      path: join(scratch, packed.filename),
      headers: { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' },
    }),
  );
  await page.goto(base + '/rtl');
  await page.locator('#top').fill('rot5');
  await page
    .locator('#source')
    .fill('module rot5(input [4:0] a, output [4:0] y); assign y={a[2:0],a[4:3]}; endmodule');
  await page.locator('#build').click();
  await page.waitForFunction(
    () => !document.getElementById('status').textContent.includes('Loading'),
    {},
    { timeout: 25000 },
  );
  assert.match(await page.locator('#status').textContent(), /Synthesized netlist ready/);
  await page.locator('#port-a').fill('17');
  await page.locator('#port-a').press('Tab');
  assert.match(await page.locator('#outputs').textContent(), /y = 6/);
  console.log('Browser Yosys WASM · 5-bit rotator synthesized and simulated.');
  assert.deepEqual(errors, []);
  console.log('Keyboard, saved design, logic, sequence and RTL workflows passed.');
} finally {
  await browser?.close();
  const closed = dev.exitCode === null ? once(dev, 'exit') : null;
  dev.kill();
  if (closed) await closed;
  await rm(scratch, { recursive: true, force: true });
}

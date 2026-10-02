/**
 * probe-route.mjs — does context.route intercept the service worker's fetch?
 *
 * The answer is what the whole harness is built on: it does, and a worker-side `fetch`
 * patch does not survive the worker being recycled. Run this before trusting that claim
 * again, or after changing how OpenRouter is stubbed.
 */

import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXT } from './harness.mjs';

const dir = mkdtempSync(join(tmpdir(), 'probe-'));

const context = await chromium.launchPersistentContext(dir, {
  channel: 'chromium',
  headless: true,
  args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

let worker = context.serviceWorkers()[0];
if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
const id = new URL(worker.url()).host;

await worker.evaluate(() => chrome.storage.local.set({ openrouter_api_key: 'sk-or-probe' }));

let routed = 0;
await context.route('https://openrouter.ai/**', async (route) => {
  routed += 1;
  const sse = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'routed answer' } }] })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: sse,
  });
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(`chrome-extension://${id}/src/ui/index.html`);
await page.waitForTimeout(800);

await page.fill('#prompt', 'probe');
await page.click('#send-btn');
await page.waitForTimeout(2500);

const bodies = await page.locator('#transcript .msg__body').allTextContents();
const status = await page.locator('#send-status').textContent();

console.log('route hits:', routed);
console.log('bodies:', bodies);
console.log('send-status:', status);
console.log(routed > 0 && bodies.some((b) => b.includes('routed answer'))
  ? 'RESULT: context.route DOES intercept the service worker fetch'
  : 'RESULT: context.route does NOT reach the worker — keep the evaluate() stub');

await context.close();
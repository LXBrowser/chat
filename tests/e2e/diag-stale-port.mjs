/**
 * diag-stale-port.mjs — the worker is killed while the page sits idle, then a send.
 *
 * This is the ordinary case: the tab is left open, the worker is recycled, and the user
 * comes back and sends. `connect()` returns the cached `port` if it is truthy, so the
 * question is whether a dead port is ever detected before it is written to.
 */

import { launch, pageUrl, seedKey, stubFetch, watchErrors, close } from './harness.mjs';

const { context, worker, extensionId } = await launch();
await seedKey(worker);

const page = context.pages()[0] ?? (await context.newPage());
const errors = watchErrors(page);
await page.goto(pageUrl(extensionId));
await page.waitForTimeout(1000);

const cdp = await context.newCDPSession(page);
await cdp.send('ServiceWorker.enable');

// Open a port from the page so openrouter.js's cached `port` becomes a live reference,
// then kill the worker with nothing in flight — the state a backgrounded tab is in.
await page.evaluate(() => {
  window.__probe = chrome.runtime.connect({ name: 'openrouter' });
  window.__probeAlive = 'unknown';
  window.__probe.onDisconnect.addListener(() => {
    window.__probeAlive = 'disconnected';
  });
  window.__probe.onMessage.addListener((m) => {
    if (m?.type === 'pong') window.__probeAlive = 'alive';
  });
});

await page.waitForTimeout(400);

// A send with nothing in flight first, so openrouter.js has certainly cached its port.
await stubFetch(worker, [{ content: 'first answer' }], { chunkDelayMs: 10 });
await page.fill('#prompt', 'first');
await page.click('#send-btn');
await page.waitForTimeout(1500);

const beforeKill = await page.evaluate(() => ({
  activity: document.getElementById('activity-text').textContent,
  msgs: document.querySelectorAll('#transcript .msg').length,
}));
console.log('before kill:', beforeKill);

console.log('\nstopping the worker while idle...');
await cdp.send('ServiceWorker.stopAllWorkers');
await page.waitForTimeout(2500);

const afterKill = await page.evaluate(() => ({
  probeAlive: window.__probeAlive,
  activity: document.getElementById('activity-text').textContent,
}));
console.log('after kill (page-side probe port):', afterKill);

// The worker is restarted by the next connection. Playwright's old `worker` handle is
// dead and evaluating on it hangs forever, so the page opens a port to wake the worker
// and the harness waits for the new one to register.
await page.evaluate(() => {
  window.__wake = chrome.runtime.connect({ name: 'openrouter' });
});
const restarted = await context
  .waitForEvent('serviceworker', { timeout: 15000 })
  .catch(() => context.serviceWorkers()[0]);

await stubFetch(restarted, [{ content: 'second answer after the worker was recycled' }], { chunkDelayMs: 10 });

console.log('\nsending again...');
await page.fill('#prompt', 'second');
await page.click('#send-btn');
await page.waitForTimeout(2500);

const result = await page.evaluate(() => ({
  activity: document.getElementById('activity-text').textContent,
  sendStatus: document.getElementById('send-status').textContent,
  bodies: [...document.querySelectorAll('#transcript .msg__body')].map((b) => b.textContent.trim()),
}));
console.log('result:', result);
console.log('\nsuccess:', result.sendStatus === '' ? 'the second send went through' : `FAILED — "${result.sendStatus}"`);
console.log('errors:', errors);

await close();
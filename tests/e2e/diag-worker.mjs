/**
 * diag-worker.mjs — kills the service worker mid-request.
 *
 * The report is `Send failed: The background worker went away` from app.js. That string
 * is the fallback in openrouter.js's disconnect handler, used when
 * `chrome.runtime.lastError` carries no message — so it names a guess, not a cause.
 * This reproduces the event itself: stop the worker while a stream is in flight and see
 * what the page actually reports.
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

console.log('=== before kill ===');
console.log('service worker url:', worker.url());

// A stream long enough that the kill lands in the middle of it.
await stubFetch(
  worker,
  [{ content: Array(40).fill('token').join(' ') }],
  { chunkDelayMs: 150 },
);

await page.fill('#prompt', 'a long answer please');
await page.click('#send-btn');

await page.waitForTimeout(1200);
const midStream = await page.evaluate(() => ({
  streaming: Boolean(document.querySelector('#transcript .msg--streaming')),
  text: document.querySelector('.msg--streaming .msg__body')?.textContent.length ?? 0,
  activity: document.getElementById('activity-text').textContent,
  sendStatus: document.getElementById('send-status').textContent,
}));
console.log('\n=== mid-stream, before the kill ===');
console.log(midStream);

console.log('\n=== stopping the service worker ===');
try {
  const res = await cdp.send('ServiceWorker.stopAllWorkers');
  console.log('stopAllWorkers ->', JSON.stringify(res));
} catch (err) {
  console.log('stopAllWorkers failed:', err.message);
}

await page.waitForTimeout(3000);

const after = await page.evaluate(() => ({
  streaming: Boolean(document.querySelector('#transcript .msg--streaming')),
  activity: document.getElementById('activity-text').textContent,
  sendStatus: document.getElementById('send-status').textContent,
  sendStatusHidden: document.getElementById('send-status').hidden,
  sendDisabled: document.getElementById('send-btn').disabled,
  msgCount: document.querySelectorAll('#transcript .msg').length,
  lastBody: [...document.querySelectorAll('#transcript .msg__body')].pop()?.textContent.slice(0, 60),
}));
console.log('\n=== after the kill ===');
console.log(after);

console.log('\n=== console/page errors ===');
console.log(errors);

await close();
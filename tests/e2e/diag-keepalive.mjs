/**
 * diag-keepalive.mjs — does an idle worker actually kill a slow stream, and does a
 * ping over the port prevent it?
 *
 * Chrome suspends an MV3 service worker after ~30s without activity. A stream that goes
 * quiet for 45s mid-answer is exactly that. Two arms, same stream, one difference:
 * whether the page pings the worker while a request is in flight.
 *
 *   node diag-keepalive.mjs with-ping
 *   node diag-keepalive.mjs no-ping
 */

import { launch, pageUrl, seedKey, close } from './harness.mjs';

const arm = process.argv[2] ?? 'no-ping';
const QUIET_MS = 45_000; // longer than Chrome's idle window on purpose

console.log(`=== arm: ${arm} ===`);

const { context, worker, extensionId } = await launch();
await seedKey(worker);

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(pageUrl(extensionId));
await page.waitForTimeout(1000);

if (arm === 'with-ping') {
  // A ping every 10s over a port the page opens itself. This is the mechanism under
  // test, wired here directly rather than through openrouter.js.
  await page.evaluate(() => {
    window.__pingPort = chrome.runtime.connect({ name: 'openrouter' });
    window.__pings = 0;
    window.__pongs = 0;
    window.__pingTimer = setInterval(() => {
      window.__pings += 1;
      try {
        window.__pingPort.postMessage({ type: 'ping' });
      } catch {
        clearInterval(window.__pingTimer);
      }
    }, 10_000);
  });
}

// A stream that emits a little, goes quiet for longer than the idle window, then finishes.
await worker.evaluate(async ({ quietMs }) => {
  self.__stubRound = 0;
  self.fetch = async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (t) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`),
          );
        send('The answer starts normally. ');
        await new Promise((r) => setTimeout(r, quietMs));
        send('And this part arrives after the quiet stretch.');
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
}, { quietMs: QUIET_MS });

await page.fill('#prompt', 'tell me slowly');
await page.click('#send-btn');

// Sample while the stream is quiet. If the worker is alive, the port still answers.
for (let i = 1; i <= 5; i += 1) {
  await page.waitForTimeout(10_000);
  const state = await page.evaluate(async () => {
    const out = {
      t: Math.round(performance.now() / 1000),
      streaming: Boolean(document.querySelector('.msg--streaming')),
      streamed: document.querySelector('.msg--streaming .msg__body')?.textContent.length ?? 0,
      activity: document.getElementById('activity-text').textContent,
      sendStatus: document.getElementById('send-status').textContent,
      pings: window.__pings ?? null,
      pongs: window.__pongs ?? null,
    };
    if (window.__pingPort) {
      out.pingPortAlive = await new Promise((resolve) => {
        const t = setTimeout(() => resolve('timeout'), 2000);
        window.__pingPort.postMessage({ type: 'ping-check' });
        const orig = window.__pingPort.onMessage;
        window.__pingPort.onMessage.addListener(function once(m) {
          if (m === 'alive') {
            window.__pingPort.onMessage.removeListener(once);
            clearTimeout(t);
            resolve('alive');
          }
        });
        void orig;
      });
    }
    return out;
  });
  console.log(` t+${state.t}s`, JSON.stringify(state));
}

await page.waitForTimeout(12_000);

const final = await page.evaluate(() => ({
  streaming: Boolean(document.querySelector('.msg--streaming')),
  activity: document.getElementById('activity-text').textContent,
  sendStatus: document.getElementById('send-status').textContent,
  bodies: [...document.querySelectorAll('#transcript .msg__body')].map((b) => b.textContent.trim()),
}));
console.log('\nFINAL:', JSON.stringify(final, null, 2));
console.log(
  final.sendStatus === ''
    ? '\nRESULT: the stream survived the quiet stretch.'
    : `\nRESULT: the stream was cut. The page reported: ${final.sendStatus}`,
);

await close();
/**
 * verify-ping.mjs — the keep-alive, in isolation.
 *
 * Split out because the full suite leaves the browser in a state it does not recover
 * from once the worker has been killed on a tree with no retry (the context closes
 * before the next section runs). Run against both trees:
 *
 *   node verify-ping.mjs                        # fixed
 *   CHAT_EXT=/tmp/prefix-tree node verify-ping.mjs   # pre-fix
 */

import { launch, pageUrl, routeOpenRouter, seedKey, close, checks } from './harness.mjs';

const t = checks();
const { context, worker, extensionId } = await launch();
await seedKey(worker);

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(pageUrl(extensionId));
await page.waitForTimeout(900);

await routeOpenRouter(context, [{ text: 'a long one', delayMs: 30000 }]);

// Count pings arriving on any port opened after this listener is installed.
await worker.evaluate(() => {
  self.__pings = 0;
  chrome.runtime.onConnect.addListener((p) => {
    if (p.name !== 'openrouter') return;
    p.onMessage.addListener((m) => {
      if (m?.type === 'ping') self.__pings += 1;
    });
  });
});

// Reload so the page opens a port the listener above can actually see.
await page.reload();
await page.waitForTimeout(1200);

// Does the worker answer a ping at all?
const ponged = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const p = chrome.runtime.connect({ name: 'openrouter' });
      const timer = setTimeout(() => resolve(false), 3000);
      p.onMessage.addListener((m) => {
        if (m?.type === 'pong') {
          clearTimeout(timer);
          resolve(true);
        }
      });
      p.postMessage({ type: 'ping' });
    }),
);
t.ok('the worker answers a ping with a pong', ponged);

// Idle: nothing in flight, so no ping may be sent.
await worker.evaluate(() => { self.__pings = 0; });
await page.waitForTimeout(3000);
t.ok('no ping is sent while nothing is in flight', (await worker.evaluate(() => self.__pings)) === 0);

// In flight: the interval is 20s, so wait past one tick.
await worker.evaluate(() => { self.__pings = 0; });
await page.fill('#prompt', 'a long one');
await page.click('#send-btn');
await page.waitForTimeout(25000);
const busy = await worker.evaluate(() => self.__pings);
t.ok('a ping is sent while a request is in flight', busy >= 1, `${busy} pings in flight`);

const ok = t.report();
await close();
process.exit(ok ? 0 : 1);
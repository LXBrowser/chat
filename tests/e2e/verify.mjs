/**
 * verify.mjs — the checks named in .agents/plans/transcript-and-worker-stability.md.
 *
 * Every one of these is also run against the pre-fix tree, because a check that has
 * never been seen failing has not been run. That is the lesson of this repository's last
 * five rounds: `boot()` was never called, the manifest had no `permissions`, and `el()`
 * threw on `dataset` — all three passed green checks first.
 */

import {
  launch, awaitWorker, pageUrl, routeOpenRouter, seedKey, watchErrors, close, checks,
} from './harness.mjs';

const t = checks();

const { context, worker, extensionId } = await launch();
await seedKey(worker);

const page = context.pages()[0] ?? (await context.newPage());
const errors = watchErrors(page);
await page.goto(pageUrl(extensionId));
await page.waitForTimeout(900);

// ===========================================================================
// A. The transcript keeps its own answer
// ===========================================================================

console.log('\n--- A. the answer stays on screen through the write ---');

await context.route('https://openrouter.ai/**', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body:
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'The quick brown fox jumps over the lazy dog and keeps going for a while.' } }] })}\n\n` +
      'data: [DONE]\n\n',
  });
});

// Observe the transcript through the store-and-repaint, not around it.
await page.evaluate(() => {
  const pane = document.getElementById('transcript');
  window.__trace = [];
  const snap = () => {
    const msgs = [...pane.querySelectorAll('.msg')];
    const stream = pane.querySelector('.msg--streaming');
    window.__trace.push({
      count: msgs.length,
      streamed: (stream?.querySelector('.msg__body')?.textContent ?? '').length,
      total: msgs.reduce((n, m) => n + (m.querySelector('.msg__body')?.textContent.length ?? 0), 0),
    });
  };
  window.__obs = new MutationObserver(snap);
  window.__obs.observe(pane, { childList: true, subtree: true, characterData: true });
  snap();
});

await page.fill('#prompt', 'tell me a long one');
await page.click('#send-btn');
await page.waitForTimeout(2500);
await page.evaluate(() => {
  window.__obs.disconnect();
});

const trace = await page.evaluate(() => window.__trace);

// The assertion has to be "once the answer exists, it never shrinks" — not "the
// transcript always holds a lot of text". Before the first chunk lands the transcript
// legitimately holds one short user message, which is indistinguishable from "the answer
// vanished" if you only look at the totals. The first state where the answer has started
// is the boundary, and everything from there on must be non-decreasing.
const firstChunk = trace.findIndex((s) => s.streamed > 0);
const afterStart = trace.slice(firstChunk);
const drops = afterStart.filter((s, i) => i > 0 && s.total < afterStart[i - 1].total);

t.ok(
  'the answer never leaves the transcript while it is stored',
  firstChunk !== -1 && drops.length === 0,
  drops.length
    ? `total fell ${afterStart.map((s) => s.total).join(' → ')}`
    : `monotonic from the first chunk (${afterStart[afterStart.length - 1]?.total ?? 0} chars)`,
);

const stored = await page.locator('#transcript .msg').count();
t.ok('both turns are on screen after the send', stored === 2, `${stored} messages`);

// ===========================================================================
// B. Streaming survives a mid-answer tool round-trip
// ===========================================================================

console.log('\n--- B. a database write mid-answer does not lose the answer ---');

await context.unroute('https://openrouter.ai/**');
const toolHits = await routeOpenRouter(context, [
  {
    text: 'Renaming first while the answer is still arriving',
    tools: [{ id: 'c1', name: 'update_chat_title', arguments: '{"title":"Renamed mid stream"}' }],
  },
  { text: 'And the real answer after the rename' },
]);

await page.evaluate(() => {
  const pane = document.getElementById('transcript');
  window.__lost = 0;
  window.__obs2 = new MutationObserver(() => {
    const stream = pane.querySelector('.msg--streaming');
    // The live node must never be detached while a stream is running.
    if (stream && !stream.isConnected) window.__lost += 1;
  });
  window.__obs2.observe(pane, { childList: true, subtree: true });
});

await page.fill('#prompt', 'rename me mid answer');
await page.click('#send-btn');
await page.waitForTimeout(3500);
await page.evaluate(() => window.__obs2.disconnect());

t.ok('the streaming node is never detached mid-answer', (await page.evaluate(() => window.__lost)) === 0);
t.ok('the tool round-trip completed and the answer was stored',
  (await page.locator('#send-status').textContent()) === '', `status: "${await page.locator('#send-status').textContent()}"`);

const bodiesB = await page.locator('#transcript .msg__body').allTextContents();
t.ok('the renamed title took effect',
  (await page.locator('#chat-title').inputValue()) === 'Renamed mid stream',
  `title: "${await page.locator('#chat-title').inputValue()}"`);

// ===========================================================================
// C. Layout is structural
// ===========================================================================

console.log('\n--- C. layout ---');

const layout = await page.evaluate(() => {
  const pane = document.getElementById('transcript');
  const msgs = [...pane.querySelectorAll('.msg')];
  return {
    shrinks: msgs.map((m) => getComputedStyle(m).flexShrink),
    userAlign: getComputedStyle(pane.querySelector('.msg--user')).alignSelf,
    agentAlign: getComputedStyle(pane.querySelector('.msg:not(.msg--user)')).alignSelf,
    overflowX: getComputedStyle(pane).overflowX,
    minHeight: getComputedStyle(pane).minHeight,
    scrolls: pane.scrollHeight > pane.clientHeight,
    clipped: msgs.filter((m) => m.getBoundingClientRect().height + 1 < m.querySelector('.msg__body').scrollHeight).length,
  };
});

t.ok('no message may shrink in height', layout.shrinks.every((s) => s === '0'), `flex-shrink values: ${[...new Set(layout.shrinks)].join(', ')}`);
t.ok('user messages align right', layout.userAlign === 'flex-end', layout.userAlign);
t.ok('agent messages align left', layout.agentAlign === 'flex-start', layout.agentAlign);
t.ok('the transcript cannot scroll horizontally', layout.overflowX === 'hidden', layout.overflowX);
t.ok('the transcript can shrink so it scrolls', layout.minHeight === '0px', layout.minHeight);
t.ok('nothing is clipped', layout.clipped === 0, `${layout.clipped} clipped`);

// ===========================================================================
// D. A dead worker is retried once, visibly
// ===========================================================================

console.log('\n--- D. the worker dies mid-answer ---');

await context.unroute('https://openrouter.ai/**');
let routeHits = 0;
let round = 0;
// Round 0 is held open so the kill lands inside it. Round 1 is the retry, answered at once.
await context.route('https://openrouter.ai/**', async (route) => {
  const index = round;
  round += 1;
  routeHits += 1;

  if (index === 0) {
    await new Promise((r) => setTimeout(r, 12000)); // never completes — the worker dies
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: [DONE]\n\n' }).catch(() => {});
    return;
  }

  const body = `data: ${JSON.stringify({ choices: [{ delta: { content: 'Recovered answer from the retried request.' } }] })}\n\n`
    + 'data: [DONE]\n\n';
  await route.fulfill({ status: 200, contentType: 'text/event-stream', body });
});

const cdp = await context.newCDPSession(page);
await cdp.send('ServiceWorker.enable');

// Record every state the status row passes through.
await page.evaluate(() => {
  window.__states = [];
  const el = document.getElementById('activity-text');
  window.__obs3 = new MutationObserver(() => window.__states.push(el.textContent));
  window.__obs3.observe(el, { childList: true, characterData: true, subtree: true });
  window.__states.push(el.textContent);
});

await page.fill('#prompt', 'this one dies');
await page.click('#send-btn');
await page.waitForTimeout(1500);
await cdp.send('ServiceWorker.stopAllWorkers');
await page.waitForTimeout(4000);
await page.evaluate(() => window.__obs3.disconnect());

const states = await page.evaluate(() => window.__states);
console.log('  status row passed through:', JSON.stringify([...new Set(states)]));

t.ok('the reconnect was announced', states.some((s) => /Reconnecting/.test(s)), 'the re-bill is visible, not silent');
t.ok('the request was retried', routeHits === 2, `${routeHits} OpenRouter requests (1 original + ${routeHits - 1} retry)`);
t.ok('exactly one retry — never more', routeHits === 2);

const statusD = await page.locator('#send-status').textContent();
t.ok('the recovered answer completed', statusD === '', `status: "${statusD}"`);

const bodiesD = await page.locator('#transcript .msg__body').allTextContents();
t.ok('the retried answer is what is stored',
  bodiesD.some((b) => b.includes('Recovered answer')), `last: "${bodiesD[bodiesD.length - 1]}"`);
t.ok('the user turn is stored exactly once across the retry',
  bodiesD.filter((b) => b.trim() === 'this one dies').length === 1,
  `${bodiesD.filter((b) => b.trim() === 'this one dies').length} copies of the prompt`);

// ===========================================================================
// E. A decided failure is not retried
// ===========================================================================

console.log('\n--- E. a 401 is never retried ---');

await context.unroute('https://openrouter.ai/**');
let rejected = 0;
await context.route('https://openrouter.ai/**', async (route) => {
  rejected += 1;
  await route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: { message: 'No auth credentials found' } }),
  });
});

// This check drives a deliberate 401, which logs a console.error by design. Errors are
// counted from here so the run-wide assertion below judges only what came before it.
const errorsBeforeE = errors.length;

await page.fill('#prompt', 'this one is refused');
await page.click('#send-btn');
await page.waitForTimeout(2500);

const statusE = await page.locator('#send-status').textContent();
t.ok('the 401 is not retried — one request only', rejected === 1, `${rejected} requests`);
t.ok('the 401 reason is shown', /401/.test(statusE), `status: "${statusE}"`);

// ===========================================================================
// F. The keep-alive
// ===========================================================================

console.log('\n--- F. keep-alive ---');

await context.unroute('https://openrouter.ai/**');
// The request has to stay open for longer than the 20s ping interval, or there is
// nothing in flight when the tick comes and there is nothing to observe.
await routeOpenRouter(context, [{ text: 'a long one', delayMs: 32000 }]);

// Test D killed the worker, so the handle from `launch()` is dead. Take the live one —
// `serviceWorkers()[0]` can still be the stopped one while its replacement registers.
const liveWorker = await awaitWorker(context);

// Count the pings the worker actually receives. A second onConnect listener, so the
// worker's own is untouched.
await liveWorker.evaluate(() => {
  self.__pings = 0;
  chrome.runtime.onConnect.addListener((p) => {
    if (p.name !== 'openrouter') return;
    p.onMessage.addListener((m) => {
      if (m?.type === 'ping') self.__pings += 1;
    });
  });
});

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

// Idle: no request in flight, so no ping may be sent.
await liveWorker.evaluate(() => { self.__pings = 0; });
await page.waitForTimeout(3000);
const idlePings = await liveWorker.evaluate(() => self.__pings);
t.ok('no ping is sent while nothing is in flight', idlePings === 0, `${idlePings} pings while idle`);

// In flight: the page pings while a request is open.
//
// `onConnect` fires once per port, and the page opens one port and keeps it for the life
// of the tab — so the listener installed above never saw the connection the page is
// using now, and counts zero whether or not the ping works. Reloading the page makes it
// open a fresh port *after* the listener is installed, which is the only way to observe
// a ping on the port the page is actually sending on.
await page.reload();
await page.waitForTimeout(1200);

await liveWorker.evaluate(() => { self.__pings = 0; });
await page.fill('#prompt', 'a long one');
await page.click('#send-btn');
await page.waitForTimeout(24000);

const inFlight = await page.evaluate(() => ({
  streaming: Boolean(document.querySelector('.msg--streaming')),
  activity: document.getElementById('activity-text').textContent,
}));
const busyPings = await liveWorker.evaluate(() => self.__pings);
await page.waitForTimeout(12000);

t.ok('a ping is sent while a request is in flight',
  busyPings >= 1,
  `${busyPings} pings, request still open (${inFlight.activity})`);
t.ok('the request really was still in flight when the ping fired', inFlight.streaming);

// ===========================================================================
console.log('\n--- page errors ---');
t.ok('no page errors outside the deliberate 401', errorsBeforeE === 0, errors.slice(0, errorsBeforeE).join(' | ') || 'none');

const allPassed = t.report();
console.log(allPassed ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
await close();
process.exit(allPassed ? 0 : 1);
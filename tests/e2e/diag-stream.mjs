/**
 * diag-stream.mjs — watches the transcript while it is being rewritten.
 *
 * The static layout measures clean. The report says messages "sometimes" disappear, so
 * the defect has to be in the repaint path: `renderTranscript()` replaces every child on
 * every database write, and a tool call mid-answer is exactly such a write.
 */

import { launch, pageUrl, seedKey, stubFetch, watchErrors, close } from './harness.mjs';

const { context, worker, extensionId } = await launch();
await seedKey(worker);

const page = context.pages()[0] ?? (await context.newPage());
const errors = watchErrors(page);
await page.goto(pageUrl(extensionId));
await page.waitForTimeout(1000);

/**
 * Records every state the transcript passes through, by observing it rather than
 * sampling it — polling too slowly misses the state that lasts one tick.
 */
async function record(label, action) {
  await page.evaluate(() => {
    const pane = document.getElementById('transcript');
    window.__trace = [];
    window.__obs?.disconnect();

    const snap = (why) => {
      const msgs = [...pane.querySelectorAll('.msg')];
      const stream = pane.querySelector('.msg--streaming');
      window.__trace.push({
        why,
        count: msgs.length,
        streaming: Boolean(stream),
        streamingAttached: Boolean(stream && stream.isConnected),
        streamingText: (stream?.querySelector('.msg__body')?.textContent ?? '').length,
        totalText: msgs.reduce((n, m) => n + (m.querySelector('.msg__body')?.textContent.length ?? 0), 0),
        // The module-level `stream` in views.js, which pushDelta writes into.
        liveStreamAttached: window.__peekStream ? window.__peekStream().isConnected : null,
      });
    };

    window.__obs = new MutationObserver(() => snap('mutation'));
    window.__obs.observe(pane, { childList: true, subtree: true, characterData: true });
    snap('before');
  });

  await action();

  await page.evaluate(() => {
    window.__obs?.disconnect();
    window.__obs = null;
  });

  const trace = await page.evaluate(() => window.__trace);
  console.log(`\n===== ${label} =====`);
  for (const t of trace) {
    if (t.why === 'mutation' && t.count === 0 && t.streamingText === 0) continue;
    console.log(
      `  ${t.why.padEnd(9)} msgs=${String(t.count).padStart(2)} streaming=${t.streaming ? 'Y' : 'n'} ` +
      `attached=${t.streamingAttached ? 'Y' : 'n'} streamText=${String(t.streamingText).padStart(4)} total=${String(t.totalText).padStart(5)}`,
    );
  }
  const vanished = trace.filter((t) => t.liveStreamAttached === false);
  console.log('  >>> live stream node detached at least once:', vanished.length > 0 ? 'YES' : 'no');
  return trace;
}

// --- 1. A plain answer, no tool call ------------------------------------------
await stubFetch(worker, [{ content: 'Plain answer with no tools involved at all' }], { chunkDelayMs: 30 });
await record('plain answer', async () => {
  await page.fill('#prompt', 'plain');
  await page.click('#send-btn');
  await page.waitForTimeout(1500);
});

// --- 2. update_chat_title mid-answer: a database write while streaming ---------
await stubFetch(
  worker,
  [
    {
      content: 'Let me rename this chat first while the answer is still arriving',
      toolCalls: [{ id: 'call_1', name: 'update_chat_title', arguments: '{"title":"Renamed mid stream"}' }],
    },
    { content: 'And here is the answer after the rename happened' },
  ],
  { chunkDelayMs: 30 },
);

await record('update_chat_title mid-answer (a DB write while streaming)', async () => {
  await page.fill('#prompt', 'rename me');
  await page.click('#send-btn');
  await page.waitForTimeout(3000);
});

// --- 3. Multi-agent on: concurrent requests sharing one port -----------------
await page.click('#multiagent-toggle');
await stubFetch(worker, [{ content: 'main and sub agents streaming together at once' }], { chunkDelayMs: 20 });

await record('multi-agent on, concurrent requests', async () => {
  await page.fill('#prompt', 'fan out please');
  await page.click('#send-btn');
  await page.waitForTimeout(2500);
});

console.log('\nfinal message count:', await page.locator('#transcript .msg').count());
console.log('final activity:', await page.locator('#activity-text').textContent());
console.log('final send status:', await page.locator('#send-status').textContent());
console.log('page errors:', errors);

await close();
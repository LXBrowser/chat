/**
 * diag-layout.mjs — measures the transcript. Reports, does not assert.
 *
 * Every prior round in this repository's history found that reading the CSS did not
 * predict the browser. So this prints what is actually true and lets the defect show
 * itself.
 */

import { launch, pageUrl, seedKey, stubFetch, watchErrors, close } from './harness.mjs';

const { context, worker, extensionId } = await launch();
await seedKey(worker);

const page = context.pages()[0] ?? (await context.newPage());
const errors = watchErrors(page);
await page.goto(pageUrl(extensionId));
await page.waitForTimeout(1000);

/** Dumps the geometry and computed style of every message in the transcript. */
async function measure(label) {
  const data = await page.evaluate(() => {
    const pane = document.getElementById('transcript');
    const pr = pane.getBoundingClientRect();
    const cs = getComputedStyle(pane);

    const msgs = [...pane.querySelectorAll('.msg')].map((m) => {
      const r = m.getBoundingClientRect();
      const s = getComputedStyle(m);
      const body = m.querySelector('.msg__body');
      return {
        role: m.querySelector('.msg__role')?.textContent,
        cls: m.className,
        left: Math.round(r.left - pr.left),
        right: Math.round(pr.right - r.right),
        width: Math.round(r.width),
        top: Math.round(r.top - pr.top),
        height: Math.round(r.height),
        // A bubble taller than its content box is being clipped or squeezed.
        clipped: r.height + 1 < body.scrollHeight,
        alignSelf: s.alignSelf,
        flexShrink: s.flexShrink,
        overflow: s.overflow,
        text: (body.textContent || '').slice(0, 28),
      };
    });

    return {
      pane: {
        width: Math.round(pr.width),
        height: Math.round(pr.height),
        clientHeight: pane.clientHeight,
        scrollHeight: pane.scrollHeight,
        scrollable: pane.scrollHeight > pane.clientHeight + 1,
        overflowY: cs.overflowY,
        flex: cs.flex,
      },
      msgs,
    };
  });

  console.log(`\n===== ${label} =====`);
  console.log('pane:', JSON.stringify(data.pane));

  let overlap = null;
  for (let i = 1; i < data.msgs.length; i += 1) {
    const prev = data.msgs[i - 1];
    const cur = data.msgs[i];
    // Overlap in a column means cur.top < prev.bottom.
    const prevBottom = prev.top + prev.height;
    if (cur.top < prevBottom - 1) {
      overlap = `msg ${i} (${cur.role}) top=${cur.top} overlaps msg ${i - 1} (${prev.role}) bottom=${prevBottom}`;
      break;
    }
  }

  for (const m of data.msgs) {
    console.log(
      `  [${String(m.role).padEnd(9)}] left=${String(m.left).padStart(4)} right=${String(m.right).padStart(4)} ` +
      `w=${String(m.width).padStart(4)} h=${String(m.height).padStart(4)} ` +
      `align=${m.alignSelf.padEnd(10)} shrink=${m.flexShrink} clipped=${m.clipped ? 'YES' : 'no'} · ${m.text}`,
    );
  }
  console.log('  overlap:', overlap ?? 'none');
  console.log('  clipped count:', data.msgs.filter((m) => m.clipped).length);
  return data;
}

// --- 1. Baseline: one short exchange -----------------------------------------
await stubFetch(worker, [{ content: 'Short answer' }], { chunkDelayMs: 10 });
await page.fill('#prompt', 'Hi');
await page.click('#send-btn');
await page.waitForTimeout(1200);
await measure('baseline — short exchange');

// --- 2. Many long messages, forcing the pane to scroll ------------------------
const long = Array(14).fill('This is a deliberately long sentence that should wrap across more than one line in the transcript pane so the container has to scroll').join(' ');
await stubFetch(worker, [{ content: long }], { chunkDelayMs: 0 });
for (let i = 0; i < 6; i += 1) {
  await page.fill('#prompt', `Message number ${i} ` + 'padding words '.repeat(20));
  await page.click('#send-btn');
  await page.waitForTimeout(700);
}
await page.waitForTimeout(800);
await measure('after six long messages');

// --- 3. A very long unbroken token (no spaces) --------------------------------
await stubFetch(worker, [{ content: 'X'.repeat(600) }], { chunkDelayMs: 0 });
await page.fill('#prompt', 'Unbroken token test');
await page.click('#send-btn');
await page.waitForTimeout(1200);
await measure('after a 600-character unbroken token');

console.log('\npage errors:', errors);
await close();
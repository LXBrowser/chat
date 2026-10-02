/**
 * smoke.mjs — the cheapest question that still requires a real browser: does the
 * extension boot, and does a stubbed send stream an answer into the transcript?
 *
 * Prints observations rather than asserting, deliberately. This is the script to open when
 * something is broken and the failure has not been localised yet. `verify.mjs` is the one
 * that asserts; this one shows you the raw state.
 *
 * It imports `routeOpenRouter` rather than the worker-side fetch stub it used to: a patch
 * inside the worker does not survive Chrome recycling it, and this script does not force
 * that recycle — it simply would not be telling the truth about a real send if it did.
 */

import { launch, pageUrl, seedKey, routeOpenRouter, watchErrors, close } from './harness.mjs';

const { context, worker, extensionId } = await launch();
console.log('extension id:', extensionId);

await seedKey(worker);

const page = context.pages()[0] ?? (await context.newPage());
const errors = watchErrors(page);
await page.goto(pageUrl(extensionId));
await page.waitForTimeout(1200);

console.log('send status hidden:', await page.locator('#send-status').isHidden());
console.log('transcript present:', await page.locator('#transcript').count());
console.log('activity text:', await page.locator('#activity-text').textContent());

// Held as an object, not destructured: `hits` counts up as the route fires, so a
// destructured copy is a snapshot of zero taken before the first request was made.
const router = await routeOpenRouter(context, [
  { text: 'Hello from the stubbed stream' },
]);

await page.fill('#prompt', 'Say hello');
await page.click('#send-btn');
await page.waitForTimeout(2500);

console.log('--- after send ---');
console.log('activity:', await page.locator('#activity-text').textContent());
console.log('msg count:', await page.locator('#transcript .msg').count());
console.log('msg bodies:', await page.locator('#transcript .msg__body').allTextContents());
console.log('send status:', await page.locator('#send-status').textContent());
console.log('openrouter requests:', router.hits);
console.log('errors:', errors);

await close();
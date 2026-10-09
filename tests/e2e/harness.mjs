/**
 * harness.mjs — loads the unpacked extension into a real Chromium and drives it.
 *
 * OpenRouter is stubbed with `context.route`, not by patching `fetch` inside the worker.
 * That distinction is the whole reason this file exists: a worker-side patch dies the
 * moment Chrome recycles the worker, and every test here is about a worker that gets
 * recycled. Routing lives on the browser context, so it survives.
 *
 * Setup: `npm install` here, then `npx playwright install --with-deps chromium`.
 * Run: `npm test` (all four suites) or `node <file>.mjs` for one.
 */

import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The extension root — this repository, three directories up from this file.
 *
 * Derived rather than written down so a checkout works wherever it is cloned, which is
 * the point of the harness living in the repository rather than in a scratch directory.
 * `CHAT_EXT` still overrides it, and that is what lets the same suite run against a
 * pre-fix tree: point it at a worktree and the same checks must fail.
 */
export const EXT = process.env.CHAT_EXT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const OPENROUTER = 'https://openrouter.ai/**';

let context = null;
let profileDir = null;

/**
 * Resolves once the worker has the extension APIs a test needs, and returns it.
 *
 * Chrome announces a service worker before it has injected `chrome.runtime` and
 * `chrome.storage` into it. A worker evaluated in that window sees a `chrome` object
 * holding only `loadTimes` and `csi`, so `chrome.storage.local` throws a TypeError that
 * reads exactly like a manifest with no `storage` permission. Waiting for the APIs makes
 * the two distinguishable: a worker that really lacks them times out with a message that
 * says so, instead of failing on whichever line happened to run first.
 */
export async function ready(worker, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const up = await worker
      .evaluate(() => Boolean(globalThis.chrome?.runtime?.id && chrome.storage?.local))
      .catch(() => false);
    if (up) return worker;

    if (Date.now() > deadline) {
      throw new Error(
        'The extension worker never exposed chrome.storage. Is the extension loaded, and ' +
          'does the manifest declare the "storage" permission?',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * The extension's current service worker, once it is ready.
 *
 * `context.serviceWorkers()[0]` is the wrong handle after a worker has been stopped: the
 * old entry can linger and fail on its first evaluation, with the new one not yet
 * registered. This tries every known worker, and when none answers waits for the next to
 * be announced.
 */
export async function awaitWorker(context, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    for (const candidate of context.serviceWorkers()) {
      try {
        return await ready(candidate, 1500);
      } catch {
        // A stopped worker, or one that is not up yet. Try the next, then wait.
      }
    }

    const left = deadline - Date.now();
    if (left <= 0) {
      throw new Error(
        'No live extension worker appeared. If the worker was stopped and restarted, ' +
          'Playwright may not have reported the new one — observed on 1.56.1, where ' +
          'context.serviceWorkers() kept the dead handle and no "serviceworker" event fired.',
      );
    }
    await context.waitForEvent('serviceworker', { timeout: Math.min(left, 1500) }).catch(() => {});
  }
}

export async function launch() {
  profileDir = mkdtempSync(join(tmpdir(), 'chat-profile-'));

  context = await chromium.launchPersistentContext(profileDir, {
    // `channel: 'chromium'` is the full build. The default is chrome-headless-shell,
    // which cannot load an extension at all — it is the wrong binary for this product.
    channel: 'chromium',
    headless: true,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
    ],
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  await ready(worker);

  return { context, worker, extensionId: new URL(worker.url()).host };
}

export function pageUrl(extensionId) {
  return `chrome-extension://${extensionId}/src/ui/index.html`;
}

/**
 * Stubs OpenRouter at the browser-context level.
 *
 * @param {Array} script   One entry per round the worker requests. Each may set:
 *                           `text`   — the answer, delivered as SSE `delta` frames
 *                           `delayMs`— how long to hold the request open before
 *                                        answering. A request held open is one a
 *                                        worker kill can land inside.
 *                           `tools`  — tool calls to emit instead of an answer
 *                           `status` — answer with this HTTP status and no body
 * @returns {object} `{ hits }` — the number of requests the worker actually made.
 */
export async function routeOpenRouter(context, script) {
  const state = { hits: 0 };
  let round = 0;

  await context.route(OPENROUTER, async (route) => {
    const index = round;
    round += 1;
    state.hits += 1;

    const entry = script[index] ?? script[script.length - 1] ?? { text: '' };

    if (entry.delayMs) await new Promise((r) => setTimeout(r, entry.delayMs));

    if (entry.status) {
      await route.fulfill({
        status: entry.status,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'No auth credentials found' } }),
      });
      return;
    }

    const frames = [];
    for (const word of (entry.text ?? '').split(' ').filter(Boolean)) {
      frames.push(`data: ${JSON.stringify({ choices: [{ delta: { content: `${word} ` } }] })}\n\n`);
    }
    (entry.tools ?? []).forEach((call, i) => {
      frames.push(`data: ${JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [{
              index: i,
              id: call.id,
              function: { name: call.name, arguments: call.arguments },
            }],
          },
        }],
      })}\n\n`);
    });
    frames.push('data: [DONE]\n\n');

    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: frames.join(''),
    });
  });

  return state;
}

/** Stores a placeholder key so boot() gets past the gate. No billable call is made. */
export async function seedKey(worker, value = 'sk-or-v1-placeholder') {
  await worker.evaluate((k) => chrome.storage.local.set({ openrouter_api_key: k }), value);
}

export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

export async function close() {
  await context?.close();
  if (profileDir) rmSync(profileDir, { recursive: true, force: true });
}

/** A tiny assertion counter, so a run reports N/N rather than throwing on the first miss. */
export function checks() {
  const results = [];
  return {
    ok(name, condition, detail = '') {
      results.push({ name, pass: Boolean(condition), detail });
      console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    },
    report() {
      const passed = results.filter((r) => r.pass).length;
      console.log(`\n  ${passed}/${results.length} checks passed`);
      const failed = results.filter((r) => !r.pass);
      if (failed.length) console.log(`  failed: ${failed.map((f) => f.name).join(', ')}`);
      return failed.length === 0;
    },
  };
}
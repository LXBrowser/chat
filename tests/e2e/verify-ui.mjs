/**
 * verify-ui.mjs — what a person sees and what lands in IndexedDB.
 *
 * One section per defect, each written to fail on the tree before its fix. Run it against a
 * pre-fix worktree with `CHAT_EXT=<path> node verify-ui.mjs` and the section for a fault that
 * tree still has must fail with the signature named in that section.
 *
 * The data is seeded through `db.js` rather than typed through the interface, and it is
 * *non-empty*. "Delete works" was once confirmed here on chats that had no messages — the one
 * case that cannot fail, because a delete with nothing to delete never reaches the faulty
 * line.
 */

import {
  launch, pageUrl, seedKey, watchErrors, close, checks,
} from './harness.mjs';

const t = checks();

const { context, worker, extensionId } = await launch();
await seedKey(worker);

// Nothing in this file should reach OpenRouter. A request that does is counted, and refused.
let leaked = 0;
await context.route('https://openrouter.ai/**', (route) => {
  leaked += 1;
  return route.abort();
});

const page = context.pages()[0] ?? (await context.newPage());
const errors = watchErrors(page);
page.on('dialog', (dialog) => dialog.accept());

await page.goto(pageUrl(extensionId));
await page.waitForSelector('.history__item');

/** Creates a chat behind the interface's back, then reloads so the interface sees it. */
async function seedChat(title, turns) {
  const id = await page.evaluate(async ([chatTitle, chatTurns]) => {
    const db = await import('../db.js');
    const session = await db.createSession(chatTitle);
    for (const [role, content] of chatTurns) await db.addMessage(session.id, role, content);
    return session.id;
  }, [title, turns]);

  await page.reload();
  await page.waitForSelector('.history__item');
  return id;
}

const titles = () => page.locator('.history__name').allTextContents();

const stored = (id) =>
  page.evaluate(async (sessionId) => {
    const db = await import('../db.js');
    return {
      session: Boolean(await db.getSession(sessionId)),
      messages: (await db.listMessages(sessionId)).length,
    };
  }, id);

/** Presses the × on the history row with this title and gives the repaint a moment. */
async function deleteChat(title) {
  await page.locator('.history__item', { hasText: title }).locator('.history__del').click();
  await page.waitForTimeout(800);
}

// ===========================================================================
// A. A chat that has messages can be deleted
// ===========================================================================

console.log('\n--- A. deleting a chat that has messages ---');

// Control first: an empty chat has always deleted, and must keep doing so.
const emptyId = await seedChat('Empty chat', []);
await deleteChat('Empty chat');
t.ok('an empty chat is deleted (control)', !(await titles()).includes('Empty chat'),
  `history: ${JSON.stringify(await titles())}`);
t.ok('...and is gone from the database', !(await stored(emptyId)).session);

const fullId = await seedChat('Chat with messages', [
  ['user', 'a question'],
  ['assistant', 'an answer'],
]);
const before = await stored(fullId);
t.ok('the seeded chat really holds two messages', before.session && before.messages === 2,
  `${before.messages} messages`);

const errorsBefore = errors.length;
await deleteChat('Chat with messages');

t.ok('the chat leaves the history list', !(await titles()).includes('Chat with messages'),
  `history: ${JSON.stringify(await titles())}`);

const after = await stored(fullId);
t.ok('it is gone from the database', !after.session, after.session ? 'the session is still stored' : '');
t.ok('its messages went with it', after.messages === 0, `${after.messages} messages left`);
t.ok('no page error was raised', errors.length === errorsBefore,
  errors.slice(errorsBefore).join(' | ') || 'none');

await page.reload();
await page.waitForSelector('.history__item');
t.ok('it stays gone after a reload', !(await titles()).includes('Chat with messages'));

// ===========================================================================
t.ok('no request reached OpenRouter', leaked === 0, `${leaked} requests`);

const allPassed = t.report();
console.log(allPassed ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
await close();
process.exit(allPassed ? 0 : 1);

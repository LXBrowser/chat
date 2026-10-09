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
  launch, pageUrl, routeOpenRouter, seedKey, watchErrors, close, checks, OPENROUTER,
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

t.ok('no request reached OpenRouter', leaked === 0, `${leaked} requests`);
await context.unroute(OPENROUTER);

// ===========================================================================
// B. A send belongs to the chat it started in
// ===========================================================================
//
// Every scenario holds the first OpenRouter response open with `delayMs`, because the
// fault only exists while a person can click somewhere else. Each ends only when the send
// button comes back, so the next one starts from a settled page.

console.log('\n--- B. a send is filed under the chat it started in ---');

const openChat = async (title) => {
  await page.locator('.history__name', { hasText: new RegExp(`^${title}$`) }).click();
  await page.waitForTimeout(300);
};
const send = async (text) => {
  await page.fill('#prompt', text);
  await page.click('#send-btn');
};
const settled = async () => {
  await page.waitForFunction(() => !document.getElementById('send-btn').disabled, null, { timeout: 20000 });
  await page.waitForTimeout(300);
};
const stubWith = async (script) => {
  await context.unroute(OPENROUTER);
  return routeOpenRouter(context, script);
};
const turns = (id) =>
  page.evaluate(async (sessionId) => {
    const db = await import('../db.js');
    return (await db.listMessages(sessionId)).map((m) => `${m.role}: ${m.content.trim()}`);
  }, id);
const titleOf = (id) =>
  page.evaluate(async (sessionId) => (await (await import('../db.js')).getSession(sessionId))?.title, id);
const viewing = () => page.locator('#chat-title').inputValue();
const bubbles = () => page.locator('#transcript .msg--streaming').count();
const messages = () => page.locator('#transcript .msg').count();

// --- B1. Ask in A, move to B before the answer arrives -----------------------

let stub = await stubWith([{ text: 'THE ANSWER FOR CHAT A', delayMs: 2500 }]);
const chatA = await seedChat('Chat A', []);
const chatB = await seedChat('Chat B', []);

await openChat('Chat A');
await send('question asked in A');
await page.waitForTimeout(700);
await openChat('Chat B');
await page.waitForTimeout(500);

t.ok('the person is looking at Chat B while A is answered', (await viewing()) === 'Chat B', await viewing());
t.ok('the streaming bubble does not appear in Chat B', (await bubbles()) === 0,
  `${await bubbles()} streaming bubble(s) in Chat B`);
t.ok('Chat B shows no message of Chat A', (await messages()) === 0, `${await messages()} messages on screen`);

await settled();
const aTurns = await turns(chatA);
const bTurns = await turns(chatB);
t.ok('Chat A holds its question and its answer',
  aTurns.length === 2 && aTurns[0] === 'user: question asked in A' && aTurns[1] === 'assistant: THE ANSWER FOR CHAT A',
  JSON.stringify(aTurns));
t.ok('Chat B holds nothing', bTurns.length === 0, JSON.stringify(bTurns));
t.ok('exactly one request was made', stub.hits === 1, `${stub.hits} requests`);

// --- B2. Move away and come back before the answer arrives -------------------
//
// This one cannot fail on the tree before the fix: there the bubble followed the person
// everywhere. It guards the fix's own new path — the bubble leaves other chats and must be
// put back when its own chat is reopened.

stub = await stubWith([{ text: 'ANSWER FOR CHAT C', delayMs: 2500 }]);
const chatC = await seedChat('Chat C', []);
const chatD = await seedChat('Chat D', []);

await openChat('Chat C');
await send('question asked in C');
await page.waitForTimeout(500);
await openChat('Chat D');
await page.waitForTimeout(400);
await openChat('Chat C');
await page.waitForTimeout(400);

t.ok('the bubble is back when its own chat is reopened mid-answer', (await bubbles()) === 1,
  `${await bubbles()} streaming bubble(s) in Chat C`);

await settled();
const cTurns = await turns(chatC);
t.ok('Chat C holds its question and its answer',
  cTurns.length === 2 && cTurns[1] === 'assistant: ANSWER FOR CHAT C', JSON.stringify(cTurns));
t.ok('Chat D holds nothing', (await turns(chatD)).length === 0, JSON.stringify(await turns(chatD)));

// --- B3. The title tool renames the chat that asked ---------------------------

stub = await stubWith([
  {
    delayMs: 1800,
    tools: [{ id: 'call_title', name: 'update_chat_title', arguments: JSON.stringify({ title: 'Renamed by the tool' }) }],
  },
  { text: 'done' },
]);
const chatE = await seedChat('Chat E', []);
const chatF = await seedChat('Chat F', []);

await openChat('Chat E');
await send('name this chat');
await page.waitForTimeout(500);
await openChat('Chat F');
await settled();

t.ok('the chat that asked was renamed', (await titleOf(chatE)) === 'Renamed by the tool', `Chat E is "${await titleOf(chatE)}"`);
t.ok('the chat that was open was left alone', (await titleOf(chatF)) === 'Chat F', `Chat F is "${await titleOf(chatF)}"`);
t.ok('both rounds of the tool conversation were made', stub.hits === 2, `${stub.hits} requests`);

t.ok('no page error through the routing scenarios', errors.length === 0, errors.join(' | ') || 'none');

// --- B4. The chat is deleted while its answer is on the way -------------------
//
// The send fails by design here, which logs a console error. The page-error check above
// has already run, so nothing after this point is judged for errors.

stub = await stubWith([{ text: 'ANSWER FOR CHAT G', delayMs: 2500 }]);
const chatG = await seedChat('Chat G', []);
await seedChat('Chat H', []);

await openChat('Chat G');
await send('question asked in G');
await page.waitForTimeout(600);
await deleteChat('Chat G');
await settled();

const everything = await page.evaluate(async () => {
  const db = await import('../db.js');
  const lines = [];
  for (const session of await db.listSessions()) {
    for (const m of await db.listMessages(session.id)) lines.push(`${session.title}: ${m.content.trim()}`);
  }
  return lines;
});
const misfiled = everything.filter((line) => line.includes('ANSWER FOR CHAT G'));
const statusB4 = await page.locator('#send-status').textContent();

t.ok('the deleted chat is gone', !(await stored(chatG)).session);
t.ok('its answer is not filed under a chat that did not ask', misfiled.length === 0, misfiled.join(' | ') || 'none');
t.ok('the person is told the chat was deleted', /deleted/i.test(statusB4), `status: "${statusB4}"`);

// ===========================================================================
// C. The key modal: Enter belongs to the control that has focus
// ===========================================================================
//
// Reached through Settings with a key already stored, so the interface needs no fresh
// launch. The key is read from the page's own `chrome.storage` — a test may do what the
// page code is forbidden to — rather than through the worker handle, which can be a stale
// one by now.

console.log('\n--- C. the key modal ---');

await context.unroute(OPENROUTER);

const storedKey = () =>
  page.evaluate(async () => (await chrome.storage.local.get('openrouter_api_key')).openrouter_api_key);
const modalOpen = () => page.locator('#api-key-modal').isVisible();

await page.reload();
await page.waitForSelector('.history__item');
const original = await storedKey();
t.ok('a key is stored to begin with', typeof original === 'string' && original.length > 0, 'placeholder key');

// Open Settings, unlock the field, type a replacement — then change your mind with the keyboard.
await page.click('[data-action="open-settings"]');
await page.click('[data-action="edit-key"]');
await page.fill('#api-key-input', 'sk-or-v1-TYPED-THEN-ABANDONED');
await page.focus('[data-action="cancel-key"]');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);

t.ok('Enter on Cancel closes the modal', !(await modalOpen()), (await modalOpen()) ? 'the modal is still open' : '');
const afterCancel = await storedKey();
t.ok('...and stores nothing', afterCancel === original,
  afterCancel === original ? 'the original key is unchanged' : `the stored key is now "${afterCancel}"`);

// Control: Enter inside the field is still the keyboard way to save.
await page.click('[data-action="open-settings"]');
await page.click('[data-action="edit-key"]');
await page.fill('#api-key-input', 'sk-or-v1-SAVED-WITH-ENTER');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);

t.ok('Enter in the field still saves (control)', (await storedKey()) === 'sk-or-v1-SAVED-WITH-ENTER',
  `stored: "${await storedKey()}"`);
t.ok('...and closes the modal', !(await modalOpen()));

// Control: Enter on the primary button submits once — the click, not a second path.
await page.click('[data-action="open-settings"]');
await page.click('[data-action="edit-key"]');
await page.fill('#api-key-input', 'sk-or-v1-SAVED-FROM-THE-BUTTON');
await page.focus('[data-action="save-key"]');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);

t.ok('Enter on the Update key button saves (control)', (await storedKey()) === 'sk-or-v1-SAVED-FROM-THE-BUTTON',
  `stored: "${await storedKey()}"`);

// ===========================================================================
// D. The dropzone says what it does with a file
// ===========================================================================
//
// Attached files are listed and never read. That is a limit, not a fault, but a dropzone
// that says nothing about it implies the opposite: someone drops a file, sees it listed, and
// reasonably expects the model to have it.

console.log('\n--- D. the dropzone is honest about its files ---');

await page.reload();
await page.waitForSelector('.history__item');

const hint = page.locator('#file-hint');
t.ok('a hint sits beside the dropzone', (await hint.count()) === 1, `${await hint.count()} element(s) with id file-hint`);
t.ok('...and is visible', (await hint.count()) === 1 && (await hint.isVisible()));
const hintText = (await hint.count()) ? (await hint.textContent()).trim() : '';
t.ok('...and says the contents are not sent', /not sent/i.test(hintText), `"${hintText}"`);
t.ok('...and the dropzone is described by it',
  (await page.locator('#dropzone').getAttribute('aria-describedby')) === 'file-hint',
  `aria-describedby="${await page.locator('#dropzone').getAttribute('aria-describedby')}"`);

// Control: a chosen file is still listed, as before.
await page.setInputFiles('#file-input', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
await page.waitForTimeout(200);
t.ok('a chosen file is still listed (control)',
  (await page.locator('#file-list .dropzone__file').allTextContents()).some((s) => s.includes('notes.txt')),
  JSON.stringify(await page.locator('#file-list .dropzone__file').allTextContents()));

// ===========================================================================
const allPassed = t.report();
console.log(allPassed ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
await close();
process.exit(allPassed ? 0 : 1);

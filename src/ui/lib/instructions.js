/**
 * instructions.js — the Main Agent's system prompt, and where it comes from.
 *
 * The repository's own `AGENTS.md` is a file in a checkout, and a browser never sees it —
 * an unpacked extension can only read files inside its own directory. So the prompt ships
 * with the extension as `src/prompts/system-instructions.md`, is seeded into
 * `agent_instructions` on first run, and is read back from there on every later run.
 *
 * Seeding once and reading from the database afterwards is what makes the table worth
 * having: the stored copy is the one that can be edited, and the bundled file is only ever
 * the starting point.
 *
 * The fallback below matters more than it looks. A failed fetch must not leave the agent
 * with no instructions at all — that is the difference between a chat with a bad system
 * prompt and a chat that behaves erratically.
 */

import * as db from '../../db.js';

/** The one instruction set the extension uses. Matches `db.js`'s id rule. */
const MAIN = 'main';

/** Seeded on first run; never written again. */
const SEED_URL = new URL('../../prompts/system-instructions.md', import.meta.url);

/**
 * The last line of defence. Short by design — it establishes that the agent has tools and
 * should ground its answers, and that is all a fallback has room to do.
 */
const FALLBACK =
  'You are the main agent in a chat workspace. You have search_web, read_page and ' +
  'update_chat_title available. Look things up before stating them as fact, answer ' +
  'directly rather than describing what you will do, and say so plainly when you could ' +
  'not find something.';

/**
 * The Main Agent's system prompt.
 *
 * Seeds from the bundled file on first run, then always reads the stored copy — so a stored
 * edit survives, and reinstalling the extension does not silently overwrite it.
 */
export async function get() {
  const stored = await db.getInstruction(MAIN);

  if (stored?.contents?.trim()) return stored.contents;

  const seed = await readSeed();

  try {
    await db.saveInstruction(MAIN, seed);
  } catch (err) {
    // A failure to persist is survivable: the prompt still works this session. What must
    // not happen is the agent booting with nothing.
    console.warn('Could not store the system instructions:', err.message);
  }

  return seed;
}

/** True once the seed has been written, so the interface can say it is configured. */
export async function isSeeded() {
  const stored = await db.getInstruction(MAIN);
  return Boolean(stored?.contents?.trim());
}

/** Replaces the stored instructions. This is what a future settings editor calls. */
export async function replace(contents) {
  const text = String(contents ?? '').trim();
  if (!text) throw new Error('Instructions cannot be empty.');
  await db.saveInstruction(MAIN, text);
  return text;
}

/**
 * Reads the bundled seed file.
 *
 * Returns the fallback rather than throwing: the extension has to work even if the file is
 * missing from a partial install or the fetch is blocked.
 */
async function readSeed() {
  try {
    const response = await fetch(SEED_URL);
    if (!response.ok) throw new Error(`status ${response.status}`);
    const text = (await response.text()).trim();
    if (!text) throw new Error('the file was empty');
    return text;
  } catch (err) {
    console.warn(`Could not read the bundled instructions (${err.message}); using the fallback.`);
    return FALLBACK;
  }
}
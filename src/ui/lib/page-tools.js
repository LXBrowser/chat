/**
 * page-tools.js — the tools that can only run in the page.
 *
 * A tool belongs here when it needs the DOM or the database. `update_chat_title` writes to
 * `chat_sessions` and repaints the title bar, and the service worker can do neither: it has
 * no `currentId`, because that is page state, and no interface to update.
 *
 * So the worker asks the page over the port and waits. The split is not a preference — the
 * page is the only context that can honour the request at all.
 *
 * Schemas for these tools are declared alongside the network ones in `src/tools.js`, so the
 * model is told about all three in one list.
 */

import * as sessions from './sessions.js';

/** `chat_sessions.title` is VARCHAR(255). */
const MAX_TITLE = 255;

/** The tools this context can execute. The names match the schemas in `src/tools.js`. */
export const PAGE_TOOLS = {
  update_chat_title,
};

/** The names the worker should forward here rather than run itself. */
export function pageToolNames() {
  return Object.keys(PAGE_TOOLS);
}

/**
 * Runs a page-side tool by name.
 *
 * @returns {Promise<string>} a result string, because that is what goes back to the model.
 * @throws {Error} which the port client turns into a failed tool result.
 */
export async function runPageTool(name, args, context = {}) {
  const tool = PAGE_TOOLS[name];
  if (!tool) throw new Error(`No such page tool: ${name}`);
  return tool(args ?? {}, context);
}

/**
 * Renames the chat the request was made in.
 *
 * The chat comes from `context.sessionId`, fixed when the send started, and not from
 * whichever chat is open when the tool call arrives. The call can arrive seconds into an
 * answer, and the person may have clicked into another chat by then — renaming "the open
 * chat" would retitle one they were not asking in.
 *
 * Truncates rather than rejecting an over-long title: the model picked the words, and a
 * slightly shortened title is a better outcome than a tool error it has to recover from.
 */
async function update_chat_title({ title } = {}, { sessionId } = {}) {
  const clean = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);

  if (!clean) throw new Error('A title is required.');
  if (!sessionId) throw new Error('No chat is open to rename.');

  const session = await sessions.renameSession(sessionId, clean);

  return JSON.stringify({ ok: true, title: session.title });
}
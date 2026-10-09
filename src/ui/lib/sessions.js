/**
 * sessions.js — the left pane: chat history and the message transcript.
 *
 * Owns every read and write against `db.js` for the conversation surface. Nothing else in
 * the extension touches the database directly, so there is one place where "a message was
 * added" also means "the session's updated_at was bumped".
 */

import * as db from '../../db.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** The session currently open, or null when the pane is empty. */
let currentId = null;

/** Subscribe listeners, so app.js can react to history changing. */
const listeners = new Set();

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

export function current() {
  return currentId;
}

/** The full record for the open session, or null. */
export async function getCurrent() {
  if (!currentId) return null;
  return db.getSession(currentId);
}

/**
 * The full record for a session by id, or null if it no longer exists.
 *
 * For anything that began in one chat and finishes while another may be open. "The open
 * chat" is where the person is looking now, not where the work belongs.
 */
export async function getSession(id) {
  return (await db.getSession(id)) ?? null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Every session, newest first — the order the history list renders in. */
export async function listSessions() {
  return db.listSessions();
}

export async function listMessages(sessionId = currentId) {
  if (!sessionId) return [];
  return db.listMessages(sessionId);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Creates a session, makes it current, and returns it. */
export async function createSession(title = 'New Chat') {
  const session = await db.createSession(title);
  currentId = session.id;
  emit();
  return session;
}

/**
 * Opens an existing session.
 *
 * Rejects if it does not exist, so a stale id in the UI surfaces as an error rather than
 * as an empty pane that looks like data loss.
 */
export async function openSession(id) {
  const session = await db.getSession(id);
  if (!session) throw new Error(`No such session: ${id}`);
  currentId = id;
  emit();
  return session;
}

/** Renames a session by id. Rejects if it does not exist. Returns the updated record. */
export async function renameSession(id, title) {
  const session = await db.setTitle(id, title);
  emit();
  return session;
}

/** Renames the current session. Returns the updated record. */
export async function renameCurrent(title) {
  if (!currentId) throw new Error('No session is open');
  return renameSession(currentId, title);
}

/** Deletes a session and clears the pane when it was the open one. */
export async function deleteSession(id) {
  await db.deleteSession(id);
  if (currentId === id) currentId = null;
  emit();
}

/**
 * Appends a message to a session, defaulting to the open one.
 *
 * Rejects when nothing is open — the caller decides whether to open one first, because
 * silently creating a session here would hide a UI-state bug.
 */
export async function appendMessage(role, content, sessionId = currentId) {
  if (!sessionId) throw new Error('No session is open');
  const message = await db.addMessage(sessionId, role, content);
  emit();
  return message;
}

/** Opens the newest session, or creates one when the database is empty. */
export async function openMostRecentOrCreate() {
  const sessions = await db.listSessions();
  if (sessions.length) return openSession(sessions[0].id);
  return createSession();
}
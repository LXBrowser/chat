/**
 * db.js — IndexedDB layer for the chat extension.
 *
 * Wraps three object stores in promises so no calling code handles a raw
 * IDBRequest. See `.agents/rules/repository.md` for the conventions this follows.
 *
 * Schemas are declared in SCHEMA below and created on first open. IndexedDB has
 * no native FOREIGN KEY, so the `chat_messages.session_id` -> `chat_sessions.id`
 * constraint is enforced here in code — calling a store directly bypasses it.
 */

const DB_NAME = 'lxbrowser-chat';
const DB_VERSION = 1;

/** `agent_instructions.id` accepts lowercase letters and hyphens only. */
const INSTRUCTION_ID = /^[a-z-]+$/;

/** Roles a message may carry. */
const ROLES = ['user', 'assistant', 'system'];

/**
 * Object store definitions. `keyPath` is the primary key; `autoIncrement` keys
 * the store instead and omits it from the record.
 */
const SCHEMA = {
  chat_sessions: {
    keyPath: 'id',
    indexes: [{ name: 'updated_at', keyPath: 'updated_at' }],
  },
  chat_messages: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: [{ name: 'session_id', keyPath: 'session_id' }],
  },
  agent_instructions: {
    keyPath: 'id',
    indexes: [],
  },
};

// ---------------------------------------------------------------------------
// Low-level plumbing
// ---------------------------------------------------------------------------

/** Wraps an IDBRequest as a promise. */
function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Resolves when a transaction commits, rejects if it aborts or errors. */
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

/** UUID v4. `crypto.randomUUID` needs a secure context; the extension has one. */
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 0xf) >> (c === 'x' ? 0 : 4);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/**
 * Opens the database, creating stores on first run. Cached per version, so
 * repeated calls reuse one connection rather than reopening per operation.
 */
let dbPromise = null;

export function open() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      for (const [name, def] of Object.entries(SCHEMA)) {
        const store = db.objectStoreNames.contains(name)
          ? req.transaction.objectStore(name)
          : db.createObjectStore(name, {
              keyPath: def.keyPath,
              autoIncrement: Boolean(def.autoIncrement),
            });

        for (const idx of def.indexes) {
          if (!store.indexNames.contains(idx.name)) store.createIndex(idx.name, idx.keyPath);
        }
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // A second tab holding an older version must not leave this one blocked.
    req.onblocked = () => reject(new Error('Database upgrade blocked by another tab'));
  });

  return dbPromise;
}

/** Runs `fn` inside a transaction spanning `stores`, committing when it resolves. */
async function withTx(stores, mode, fn) {
  const db = await open();
  const tx = db.transaction(stores, mode);
  const done = transactionDone(tx);
  const result = await fn(tx);
  await done;
  return result;
}

// ---------------------------------------------------------------------------
// chat_sessions
// ---------------------------------------------------------------------------

/** Creates a session. `title` defaults to 'New Chat'. */
export async function createSession(title = 'New Chat') {
  const session = { id: uuid(), title, created_at: now(), updated_at: now() };
  return withTx(['chat_sessions'], 'readwrite', (tx) =>
    request(tx.objectStore('chat_sessions').add(session)),
  ).then(() => session);
}

/** Every session, most recently updated first. */
export function listSessions() {
  return withTx(['chat_sessions'], 'readonly', async (tx) => {
    const all = await request(tx.objectStore('chat_sessions').getAll());
    return all.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  });
}

export function getSession(id) {
  return withTx(['chat_sessions'], 'readonly', (tx) =>
    request(tx.objectStore('chat_sessions').get(id)),
  );
}

/** Renames a session. Rejects if the session does not exist. */
export async function setTitle(id, title) {
  const clean = String(title).trim();
  if (!clean) throw new Error('Title cannot be empty');

  return withTx(['chat_sessions'], 'readwrite', async (tx) => {
    const store = tx.objectStore('chat_sessions');
    const session = await request(store.get(id));
    if (!session) throw new Error(`No such session: ${id}`);
    session.title = clean.slice(0, 255);
    session.updated_at = now();
    await request(store.put(session));
    return session;
  });
}

/** Deletes a session and, in the same transaction, every message in it. */
export async function deleteSession(id) {
  return withTx(['chat_sessions', 'chat_messages'], 'readwrite', async (tx) => {
    // Keys come from the index, but the delete goes through the store: an `IDBIndex` can
    // read, count and open cursors, and has no `delete`. Calling it on the index threw for
    // any chat that held a message, and an empty chat never reached the line.
    const messages = tx.objectStore('chat_messages');
    const keys = await request(messages.index('session_id').getAllKeys(id));
    await Promise.all(keys.map((k) => request(messages.delete(k))));
    await request(tx.objectStore('chat_sessions').delete(id));
  });
}

// ---------------------------------------------------------------------------
// chat_messages
// ---------------------------------------------------------------------------

/**
 * Appends a message to a session.
 *
 * `message_index` is derived rather than passed, so callers cannot insert a gap
 * or a duplicate. Rejects if the session does not exist — the foreign key the
 * schema cannot express.
 */
export async function addMessage(sessionId, role, content) {
  if (!ROLES.includes(role)) throw new Error(`Unknown role: ${role}`);
  const text = String(content ?? '');
  if (!text.trim()) throw new Error('Message content cannot be empty');

  return withTx(['chat_sessions', 'chat_messages'], 'readwrite', async (tx) => {
    const sessions = tx.objectStore('chat_sessions');
    const session = await request(sessions.get(sessionId));
    if (!session) throw new Error(`No such session: ${sessionId}`);

    const messages = tx.objectStore('chat_messages').index('session_id');
    const existing = await request(messages.getAll(sessionId));

    const message = {
      session_id: sessionId,
      message_index: existing.length,
      role,
      content: text,
      created_at: now(),
    };

    await request(tx.objectStore('chat_messages').add(message));
    session.updated_at = now();
    await request(sessions.put(session));
    return message;
  });
}

/** Every message in a session, in index order. */
export function listMessages(sessionId) {
  return withTx(['chat_messages'], 'readonly', async (tx) => {
    const rows = await request(tx.objectStore('chat_messages').index('session_id').getAll(sessionId));
    return rows.sort((a, b) => a.message_index - b.message_index);
  });
}

export async function deleteMessage(id) {
  return withTx(['chat_messages'], 'readwrite', (tx) =>
    request(tx.objectStore('chat_messages').delete(id)),
  );
}

// ---------------------------------------------------------------------------
// agent_instructions
// ---------------------------------------------------------------------------

/**
 * Saves an instruction under an id. The id must be lowercase letters and
 * hyphens — these become `agents://` URIs, so they are an address, not a label.
 */
export async function saveInstruction(id, contents) {
  const key = String(id);
  if (!INSTRUCTION_ID.test(key)) {
    throw new Error(`Invalid instruction id "${key}" — lowercase letters and hyphens only`);
  }

  return withTx(['agent_instructions'], 'readwrite', async (tx) => {
    const record = { id: key, contents, updated_at: now() };
    await request(tx.objectStore('agent_instructions').put(record));
    return record;
  });
}

export function getInstruction(id) {
  return withTx(['agent_instructions'], 'readonly', (tx) =>
    request(tx.objectStore('agent_instructions').get(id)),
  );
}

export function listInstructions() {
  return withTx(['agent_instructions'], 'readonly', (tx) =>
    request(tx.objectStore('agent_instructions').getAll()),
  );
}

export async function deleteInstruction(id) {
  return withTx(['agent_instructions'], 'readwrite', (tx) =>
    request(tx.objectStore('agent_instructions').delete(id)),
  );
}
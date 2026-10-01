/**
 * background.js — the service worker, and the only place an OpenRouter request is made.
 *
 * Two rules this file exists to enforce:
 *
 *   1. **The API key never enters the page.** It is read from `chrome.storage.local` here,
 *      from the worker's own context, and never travels over a message port. A page that
 *      cannot see the key cannot leak it through the DOM, a devtools dump, or an error
 *      string — which is the whole reason the network call is not in the page.
 *   2. **One terminal message per request.** `delta` may arrive any number of times, but
 *      exactly one of `done` or `error` always arrives last. Without that guarantee a page
 *      holding an "active" agent has no way to know when to remove it.
 *
 * The page talks over a long-lived port rather than `sendMessage` because `sendMessage`
 * resolves once, at the end — it cannot carry a stream. The port is also what keeps this
 * worker alive for the duration of a long response.
 *
 * Known MV3 limitation: a single request is capped by Chrome at roughly five minutes,
 * however active the port is. A response longer than that is cut mid-stream and arrives as
 * a `network error` on the reader rather than a clean `done`.
 */

const PORT_NAME = 'openrouter';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const API_KEY_STORAGE = 'openrouter_api_key';

const APP_TITLE = '@lxbrowser/chat';

/** The sentinel OpenRouter sends after the final chunk. */
const DONE = '[DONE]';

/**
 * In-flight abort controllers, keyed by port.
 *
 * A port that disconnects — the user closed the tab, or Chrome recycled the worker — must
 * abort its requests rather than leave them running against a port nobody can read from.
 */
const inflight = new WeakMap();

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  inflight.set(port, new Set());

  port.onDisconnect.addListener(() => {
    for (const controller of inflight.get(port) ?? []) controller.abort();
  });

  port.onMessage.addListener((message) => {
    void handle(port, message);
  });
});

/**
 * Handles one `chat` request and streams the answer back.
 *
 * The port is not closed at the end: it carries the Main Agent and every sub-agent, and a
 * page with several agents in flight needs all of them on one connection.
 */
async function handle(port, message) {
  const { type, requestId, model, system, messages } = message ?? {};

  if (type !== 'chat') return;

  // Everything downstream keys on requestId, so an id is mandatory even when the rest
  // of the payload is nonsense — a request with no id cannot be answered or abandoned.
  if (!requestId) return;

  if (typeof model !== 'string' || !model.trim()) {
    post(port, { type: 'error', requestId, message: 'No model was selected.' });
    return;
  }

  if (!Array.isArray(messages) || !messages.length) {
    post(port, { type: 'error', requestId, message: 'There is nothing to send.' });
    return;
  }

  const controller = new AbortController();
  inflight.get(port)?.add(controller);

  try {
    const answer = await streamChat({ model, system, messages, signal: controller.signal }, (delta) => {
      post(port, { type: 'delta', requestId, text: delta });
    });
    post(port, { type: 'done', requestId, text: answer });
  } catch (err) {
    post(port, { type: 'error', requestId, message: describe(err) });
  } finally {
    inflight.get(port)?.delete(controller);
  }
}

/** `postMessage` throws once the far end is gone. A dead port needs no message. */
function post(port, payload) {
  try {
    port.postMessage(payload);
  } catch {
    // The page navigated or was closed mid-stream. The worker's job here is done.
  }
}

// ---------------------------------------------------------------------------
// OpenRouter
// ---------------------------------------------------------------------------

/**
 * Reads the key from this context's own storage.
 *
 * Deliberately not imported from `src/ui/lib/storage.js`: that module is page code, and
 * the worker should not depend on the page's module tree. Three lines are cheaper than
 * the coupling, and it keeps the credential on the worker side of the boundary.
 */
async function readApiKey() {
  const stored = await chrome.storage.local.get(API_KEY_STORAGE);
  const key = stored[API_KEY_STORAGE];
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

/**
 * Runs one streaming completion.
 *
 * @returns {Promise<string>} the full response text, assembled from the deltas.
 */
async function streamChat({ model, system, messages, signal }, onDelta) {
  const key = await readApiKey();
  if (!key) {
    throw new Error('No OpenRouter key is stored. Open Settings and add one.');
  }

  // The system prompt leads the conversation; it is not a message the model should see
  // quoted back as if the user had written it.
  const payload = system
    ? [{ role: 'system', content: String(system) }, ...messages]
    : messages;

  const response = await fetch(API_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'X-Title': APP_TITLE,
    },
    body: JSON.stringify({ model, stream: true, messages: payload }),
  });

  if (!response.ok) throw await httpError(response);
  if (!response.body) throw new Error('OpenRouter returned an empty response.');

  return readSse(response.body, onDelta);
}

/**
 * Reads a `text/event-stream` body and emits each content delta.
 *
 * The buffer is carried across chunk boundaries: a chunk can split a frame anywhere,
 * including mid-JSON, so anything after the last newline is held until the next read
 * rather than being parsed and discarded.
 */
async function readSse(body, onDelta) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline === -1) break;

      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);

      if (!line.startsWith('data:')) continue;

      const frame = line.slice(5).trim();
      if (!frame) continue;

      // The stream is over. Cancel so the connection is not left half-read; without
      // this the reader would sit until the server closes it.
      if (frame === DONE) {
        await reader.cancel();
        return full;
      }

      let parsed;
      try {
        parsed = JSON.parse(frame);
      } catch {
        // A frame we cannot parse is not worth failing the whole response over.
        continue;
      }

      const delta = parsed?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta) {
        full += delta;
        onDelta(delta);
      }
    }
  }

  return full;
}

/**
 * Turns a non-2xx response into a message worth showing a person.
 *
 * The body is included because OpenRouter's own error text is the useful part — a bad
 * model id and an exhausted credit balance both return 4xx with no detail otherwise. The
 * request headers are never included, so the key cannot reach the message.
 */
async function httpError(response) {
  let detail = '';

  try {
    const body = await response.text();
    try {
      detail = JSON.parse(body)?.error?.message ?? body.slice(0, 300);
    } catch {
      detail = body.slice(0, 300);
    }
  } catch {
    detail = '';
  }

  const err = new Error(
    `OpenRouter returned ${response.status}${detail ? ` — ${detail}` : ''}`,
  );
  err.status = response.status;
  return err;
}

/**
 * A message safe to show in the interface.
 *
 * `AbortError` is named rather than stringified, because a cancelled request is a normal
 * outcome and its DOMException message ("This operation was aborted") reads like a fault.
 */
function describe(err) {
  if (err?.name === 'AbortError') return 'Request cancelled.';
  return err?.message || 'The request failed for an unknown reason.';
}
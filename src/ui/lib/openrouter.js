/**
 * openrouter.js — the page's client for the service worker.
 *
 * The page never calls OpenRouter itself and never holds the API key. It opens one long-
 * lived port, asks the worker to run a completion, and receives the answer as deltas.
 *
 * Requests are keyed by `requestId` because they overlap: the Main Agent and every
 * sub-agent are in flight at once, so "the response" is not a single thing this module
 * can hold in one variable.
 *
 * The port is lazy and self-healing. An MV3 worker is terminated when idle, which closes
 * any port it held, so a disconnect is an expected event rather than an error — the next
 * call reconnects.
 *
 * **What the keep-alive is and is not.** While a request is in flight this module pings
 * the worker, and the worker answers, because an inbound message is what resets Chrome's
 * idle timer. It keeps the worker warm between sends. It does **not** prevent the failure
 * this module also handles: a worker stopped mid-answer — by an extension reload, memory
 * pressure, or Chrome's five-minute cap on a single request — dies whatever is sent to it.
 * That case is survived by reconnecting and re-sending, which is what `isRetryable()` is
 * for. Measured, not assumed: a 45-second quiet stretch with no ping at all completed
 * normally, because a pending `fetch` already holds the worker alive.
 */

const PORT_NAME = 'openrouter';

/**
 * How often to ping while something is in flight.
 *
 * Comfortably inside Chrome's idle window, so one dropped ping is not fatal. Long enough
 * that it is not traffic.
 */
const PING_INTERVAL_MS = 20_000;

let port = null;

/** requestId -> { onDelta, resolve, reject, text, onTool, onToolCall } */
const pending = new Map();

let nextRequestId = 1;

/** Non-null only while at least one request is in flight. */
let pingTimer = null;

// ---------------------------------------------------------------------------
// Port lifecycle
// ---------------------------------------------------------------------------

/** Opens the port, or returns the live one. */
function connect() {
  if (port) return port;

  port = chrome.runtime.connect({ name: PORT_NAME });

  port.onMessage.addListener((message) => {
    const entry = message?.requestId && pending.get(message.requestId);
    if (!entry) return; // a message for a request we already settled

    switch (message.type) {
      case 'delta':
        entry.text += message.text;
        entry.onDelta(message.text);
        break;

      case 'done':
        // Prefer the worker's assembled text: it is authoritative if a delta was
        // dropped somewhere in between.
        settle(message.requestId, 'resolve', message.text ?? entry.text);
        break;

      case 'error':
        settle(message.requestId, 'reject', new Error(message.message || 'The request failed.'));
        break;

      case 'tool_request':
        // Not settled by this — the worker is still waiting for the answer, and the
        // request stays pending across however many tool rounds it takes.
        void answerToolRequest(message, entry);
        break;

      case 'notice':
        // Something the person should know about the request while it runs — the model has no
        // tool support and is answering without them. Not terminal: the request still ends in
        // exactly one `done` or one `error`, so nothing is settled here.
        entry.onNotice?.(message.text);
        break;

      case 'pong':
        // Evidence the worker is alive. Nothing to do with it, and deliberately not
        // forwarded to `entry` — it carries no requestId, so it would be dropped anyway.
        break;

      default:
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    port = null;
    stopKeepAlive();

    // `chrome.runtime.lastError` is only populated inside the callback that failed, and a
    // port disconnect generally reports nothing through it. That is not a reason to
    // discard the detail when it is there — but it is why this used to show the same
    // generic sentence for every distinct cause, and why that sentence named a guess.
    const detail = chrome.runtime.lastError?.message;

    // Every request in flight is retryable: nothing came back, so nothing was stored and
    // there is no partial result to protect. A request that failed *with* an answer — a
    // 401, an empty response — is not in this loop and is never retried.
    for (const [id] of pending) {
      settle(id, 'reject', transportError(
        'The background worker stopped before this answer finished.',
        detail,
      ));
    }
  });

  return port;
}

// ---------------------------------------------------------------------------
// Keep-alive
// ---------------------------------------------------------------------------

/**
 * Starts pinging the worker, if nothing already has.
 *
 * Tied to `pending` rather than to the page: a permanent timer would mean a permanently
 * live worker for a tab nobody is talking to, which is the opposite of what an extension
 * should do with the machine's battery.
 */
function startKeepAlive() {
  if (pingTimer !== null) return;

  pingTimer = setInterval(() => {
    if (!pending.size) {
      stopKeepAlive();
      return;
    }
    try {
      port?.postMessage({ type: 'ping' });
    } catch {
      // The port is gone. `onDisconnect` owns that case and settles the requests; a ping
      // that throws must not try to settle them a second time.
    }
  }, PING_INTERVAL_MS);
}

function stopKeepAlive() {
  if (pingTimer === null) return;
  clearInterval(pingTimer);
  pingTimer = null;
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

/**
 * An error the page may safely re-issue the same request for.
 *
 * The distinction is the whole of the retry policy. A transport loss means the request
 * never produced a result, so re-sending it is free of consequence beyond the call itself.
 * A request the worker *answered* — a 401, a 402, an empty answer — has already been
 * decided, and re-sending it would spend money to be refused again.
 *
 * @param {string} message  What to show.
 * @param {string} [detail] Whatever Chrome reported, when it reported anything.
 */
function transportError(message, detail) {
  const err = new Error(detail ? `${message} (${detail})` : message);
  err.retryable = true;
  return err;
}

/**
 * Whether a failed request is worth sending again.
 *
 * True only for a lost worker. Every other failure — a rejected key, an exhausted
 * balance, a model that returned nothing — is a decision the worker already reached and
 * re-asking would only repeat.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isRetryable(err) {
  return Boolean(err?.retryable);
}

/** Settles one request and drops it from the table. */
function settle(requestId, how, value) {
  const entry = pending.get(requestId);
  if (!entry) return;
  pending.delete(requestId);

  // The last one out stops the ping, so an idle tab is not holding a worker open.
  if (!pending.size) stopKeepAlive();

  if (how === 'resolve') entry.resolve(value);
  else entry.reject(value);
}

/**
 * Runs a tool the worker cannot, and sends the result back.
 *
 * The worker is blocked on this — it has already sent its request and is holding the
 * conversation open. So the reply is best-effort, and a failure is reported as a failed
 * tool result rather than thrown: the model can route around a tool that did not work,
 * but it cannot route around a conversation that never continues.
 */
async function answerToolRequest(message, entry) {
  const reply = (payload) => {
    try {
      port?.postMessage({ type: 'tool_result', toolCallId: message.toolCallId, ...payload });
    } catch {
      // The worker is gone. It will have failed the request itself.
    }
  };

  try {
    if (typeof entry.onTool !== 'function') throw new Error('This agent has no tools.');

    entry.onToolCall?.({ name: message.name, arguments: message.arguments });

    const content = await entry.onTool(message.name, message.arguments);
    reply({ ok: true, content: typeof content === 'string' ? content : JSON.stringify(content) });
  } catch (err) {
    reply({ ok: false, error: err.message || 'The tool failed.' });
  }
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/** Whether a worker is reachable at all. False in a page with no extension context. */
export function isAvailable() {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
}

/**
 * Runs one streaming completion through the service worker.
 *
 * @param {object} spec
 * @param {string} spec.model        `{platform}/{model}` id.
 * @param {string} [spec.system]     System prompt; prepended as a system message.
 * @param {Array<{role: string, content: string}>} spec.messages Prior turns, oldest first.
 * @param {Array} [spec.tools]       Tool schemas the model may call.
 * @param {string[]} [spec.pageTools] Names the page executes; the worker runs the rest.
 * @param {(text: string) => void} [spec.onDelta] Called per chunk as it arrives.
 * @param {(name: string, args: string) => Promise<string>} [spec.onTool] Runs a page tool.
 * @param {(call: {name: string, arguments: string}) => void} [spec.onToolCall] Called when
 *        the worker asks for a tool, so the interface can log it before it runs.
 * @param {(text: string) => void} [spec.onNotice] Called with a short note about how the
 *        request is being handled, such as a model that cannot use tools.
 * @returns {Promise<string>} the complete response text.
 */
export function chat({
  model,
  system,
  messages,
  tools,
  pageTools,
  onDelta = () => {},
  onTool,
  onToolCall,
  onNotice,
}) {
  const requestId = `req-${nextRequestId++}`;

  return new Promise((resolve, reject) => {
    let live;
    try {
      live = connect();
    } catch (err) {
      // Connecting itself failed — no extension context, or the worker could not be
      // reached at all. Retryable, and worth saying so: this is the same event as a
      // worker stopping mid-answer, caught a moment earlier.
      reject(transportError('The background worker is unavailable.', err.message));
      return;
    }

    pending.set(requestId, { onDelta, onTool, onToolCall, onNotice, resolve, reject, text: '' });
    startKeepAlive();

    try {
      live.postMessage({ type: 'chat', requestId, model, system, messages, tools, pageTools });
    } catch (err) {
      // The worker died between `connect()` and `postMessage`. Nothing is in flight, so
      // this is a plain failure rather than a hanging request — but the cached port is
      // now known to be dead, and it is dropped here. `onDisconnect` does not always fire
      // for a recycled worker, and a stale port left in place would make every later call
      // fail the same way with no way back.
      port = null;
      stopKeepAlive();
      settle(requestId, 'reject', transportError(
        'The background worker went away before the request could start.',
        err.message,
      ));
    }
  });
}

/** How many requests are still open — used by the interface to show it is working. */
export function inFlight() {
  return pending.size;
}
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
 */

const PORT_NAME = 'openrouter';

let port = null;

/** requestId -> { onDelta, resolve, reject, text, onTool, onToolCall } */
const pending = new Map();

let nextRequestId = 1;

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

      default:
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    port = null;

    // Chrome reports the reason through chrome.runtime.lastError. Reading it is what
    // clears it, and it is the difference between "the worker went idle" and a real
    // failure the user could act on.
    const reason = chrome.runtime.lastError?.message ?? 'The background worker went away.';
    for (const [id] of pending) settle(id, 'reject', new Error(reason));
  });

  return port;
}

/** Settles one request and drops it from the table. */
function settle(requestId, how, value) {
  const entry = pending.get(requestId);
  if (!entry) return;
  pending.delete(requestId);
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
}) {
  const requestId = `req-${nextRequestId++}`;

  return new Promise((resolve, reject) => {
    let live;
    try {
      live = connect();
    } catch (err) {
      reject(new Error(`The background worker is unavailable: ${err.message}`));
      return;
    }

    pending.set(requestId, { onDelta, onTool, onToolCall, resolve, reject, text: '' });

    try {
      live.postMessage({ type: 'chat', requestId, model, system, messages, tools, pageTools });
    } catch (err) {
      // The worker died between `connect()` and `postMessage`. Nothing is in flight,
      // so this is a plain failure rather than a hanging request.
      settle(requestId, 'reject', new Error(`Could not reach the background worker: ${err.message}`));
    }
  });
}

/** How many requests are still open — used by the interface to show it is working. */
export function inFlight() {
  return pending.size;
}
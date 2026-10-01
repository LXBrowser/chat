/**
 * background.js — the service worker, and the only place an OpenRouter request is made.
 *
 * Three rules this file exists to enforce:
 *
 *   1. **The API key never enters the page.** It is read from `chrome.storage.local` here,
 *      from the worker's own context, and never travels over a message port. A page that
 *      cannot see the key cannot leak it through the DOM, a devtools dump, or an error
 *      string — which is the whole reason the network call is not in the page.
 *   2. **One terminal message per request.** `delta` may arrive any number of times, but
 *      exactly one of `done` or `error` always arrives last. Without that guarantee a page
 *      holding an "active" agent has no way to know when to remove it.
 *   3. **Tool failures are results, not crashes.** A tool that fails returns its error to
 *      the model as a `tool` message. The model can route around it; an exception here
 *      would end the conversation instead.
 *
 * The page talks over a long-lived port rather than `sendMessage` because `sendMessage`
 * resolves once, at the end — it cannot carry a stream. The port is also what keeps this
 * worker alive for the duration of a long response.
 *
 * The conversation loop is here rather than in the page because a tool round-trip needs a
 * second request, and holding that loop in one place is what bounds it.
 *
 * Known MV3 limitation: a single request is capped by Chrome at roughly five minutes,
 * however active the port is. A response longer than that is cut mid-stream and arrives as
 * a `network error` on the reader rather than a clean `done`.
 */

import { runNetworkTool } from './tools.js';

const PORT_NAME = 'openrouter';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const API_KEY_STORAGE = 'openrouter_api_key';

const APP_TITLE = '@lxbrowser/chat';

/** The sentinel OpenRouter sends after the final chunk. */
const DONE = '[DONE]';

/**
 * How many times the model may call tools before the conversation gives up.
 *
 * Not a safety limit so much as a loop limit: a model that keeps re-searching the same
 * query would otherwise run until Chrome's five-minute cap killed it, with no explanation.
 */
const MAX_TOOL_ROUNDS = 6;

/**
 * How long a page-side tool gets to answer before it is treated as failed.
 *
 * Page tools are local writes and take milliseconds. Anything slower is a broken page, not
 * a slow tool, and the loop should not hang on it.
 */
const PAGE_TOOL_TIMEOUT_MS = 30_000;

/**
 * In-flight state, keyed by port.
 *
 * A port that disconnects — the user closed the tab, or Chrome recycled the worker — must
 * abort its requests and reject anything waiting on it, rather than leave both running
 * against a port nobody can read from.
 */
const inflight = new WeakMap();

/** port -> Map<toolCallId, resolve>. Requests the worker made to the page. */
const awaitingPage = new WeakMap();

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  const state = { requests: new Set(), pageCalls: new Map() };
  inflight.set(port, state);
  awaitingPage.set(port, state.pageCalls);

  port.onDisconnect.addListener(() => {
    for (const controller of state.requests) controller.abort();
    // A page tool that will never answer must not hold the conversation open.
    for (const { reject } of state.pageCalls.values()) {
      reject(new Error('The page went away before the tool finished.'));
    }
    state.pageCalls.clear();
  });

  port.onMessage.addListener((message) => {
    if (message?.type === 'tool_result') {
      settlePageCall(port, message);
      return;
    }
    void handle(port, message);
  });
});

/** Resolves or rejects the waiting tool call, and stops waiting for it. */
function settlePageCall(port, message) {
  const entry = awaitingPage.get(port)?.get(message.toolCallId);
  if (!entry) return;

  clearTimeout(entry.timer);
  awaitingPage.get(port).delete(message.toolCallId);

  if (message.ok) entry.resolve(message.content);
  else entry.reject(new Error(message.error || 'The tool failed.'));
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/**
 * Handles one `chat` request and streams the answer back.
 *
 * The port is not closed at the end: it carries the Main Agent and every sub-agent, and a
 * page with several agents in flight needs all of them on one connection.
 */
async function handle(port, message) {
  const { type, requestId, model, system, messages, tools, pageTools } = message ?? {};

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
  const state = inflight.get(port);
  state?.requests.add(controller);

  try {
    const answer = await converse(
      {
        model,
        // The system prompt leads the conversation once, and stays at the front across
        // every tool round rather than being re-sent with each request.
        conversation: system ? [{ role: 'system', content: String(system) }, ...messages] : [...messages],
        tools,
        pageTools: new Set(pageTools ?? []),
        signal: controller.signal,
      },
      (delta) => post(port, { type: 'delta', requestId, text: delta }),
      (toolCall) => requestPageTool(port, requestId, toolCall),
    );

    post(port, { type: 'done', requestId, text: answer });
  } catch (err) {
    post(port, { type: 'error', requestId, message: describe(err) });
  } finally {
    state?.requests.delete(controller);
  }
}

/**
 * Runs a conversation to a final answer, resolving tool calls as they come.
 *
 * Each round either finishes or asks for tools; a round that asks for tools gets its
 * results appended to the conversation and is sent again. Bounded by `MAX_TOOL_ROUNDS`.
 *
 * @returns {Promise<string>} the final answer text.
 */
async function converse(spec, onDelta, askPage) {
  const conversation = spec.conversation;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const { content, toolCalls } = await streamChat(
      {
        model: spec.model,
        messages: conversation,
        tools: spec.tools,
        signal: spec.signal,
      },
      onDelta,
    );

    if (!toolCalls.length) return content;

    if (round === MAX_TOOL_ROUNDS) {
      throw new Error(`Stopped after ${MAX_TOOL_ROUNDS} rounds of tool calls without an answer.`);
    }

    // The assistant turn is echoed back verbatim, tool_calls included, or the API
    // rejects the following `tool` message as not answering any call.
    conversation.push({
      role: 'assistant',
      content: content || null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const result = spec.pageTools.has(call.function.name)
        ? await askPageSafely(askPage, call)
        : await runNetworkToolSafely(call);

      conversation.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
  }

  throw new Error('The conversation did not produce an answer.');
}

/**
 * Runs a worker-side tool, turning any failure into a result the model can read.
 *
 * A tool error is information. Returning it as a `tool` message lets the model try
 * something else — a different query, a different URL — which is usually the right move.
 */
async function runNetworkToolSafely(call) {
  let args;
  try {
    args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch (err) {
    return `${call.function.name} could not be run: its arguments were not valid JSON (${err.message}).`;
  }

  try {
    const result = await runNetworkTool(call.function.name, args);
    return typeof result === 'string' ? result : JSON.stringify(result);
  } catch (err) {
    return `${call.function.name} failed: ${err.message}`;
  }
}

/**
 * Asks the page to run a tool, turning any failure into a result the model can read.
 *
 * Same rule as `runNetworkToolSafely`, and it has to be the same rule: a page tool that
 * fails is as recoverable as a network tool that fails, and if only one of them ended the
 * conversation then whether `update_chat_title` worked would decide whether the agent
 * could answer at all.
 */
async function askPageSafely(askPage, call) {
  try {
    return await askPage({
      id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    });
  } catch (err) {
    return `${call.function.name} failed: ${err.message}`;
  }
}

/** Asks the page to run a tool, and waits for its answer. */
function requestPageTool(port, requestId, call) {
  return new Promise((resolve, reject) => {
    const calls = awaitingPage.get(port);
    if (!calls) {
      reject(new Error('The page is not connected.'));
      return;
    }

    const timer = setTimeout(() => {
      calls.delete(call.id);
      reject(new Error(`${call.name} timed out in the page.`));
    }, PAGE_TOOL_TIMEOUT_MS);

    calls.set(call.id, { resolve, reject, timer });

    post(port, {
      type: 'tool_request',
      requestId,
      toolCallId: call.id,
      name: call.name,
      arguments: call.arguments,
    });
  });
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
 * @returns {Promise<{content: string, toolCalls: object[]}>} the answer text, and any tool
 * calls the model asked for. Both can be present in one round, though in practice a
 * stream is either prose or tool arguments.
 */
async function streamChat({ model, messages, tools, signal }, onDelta) {
  const key = await readApiKey();
  if (!key) {
    throw new Error('No OpenRouter key is stored. Open Settings and add one.');
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'X-Title': APP_TITLE,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages,
      // Omitted rather than sent as null/empty: several providers reject a request that
      // declares tools and also pins tool_choice.
      ...(tools?.length ? { tools } : {}),
    }),
  });

  if (!response.ok) throw await httpError(response);
  if (!response.body) throw new Error('OpenRouter returned an empty response.');

  return readSse(response.body, onDelta);
}

/**
 * Reads a `text/event-stream` body, emitting content deltas and assembling tool calls.
 *
 * The buffer is carried across chunk boundaries: a chunk can split a frame anywhere,
 * including mid-JSON, so anything after the last newline is held until the next read
 * rather than being parsed and discarded.
 */
async function readSse(body, onDelta) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map();
  let buffer = '';
  let content = '';

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
        return { content, toolCalls: finishToolCalls(calls) };
      }

      let parsed;
      try {
        parsed = JSON.parse(frame);
      } catch {
        // A frame we cannot parse is not worth failing the whole response over.
        continue;
      }

      const delta = parsed?.choices?.[0]?.delta;
      if (!delta) continue;

      // Prose goes to the page as it arrives. Tool-call fragments do not: they are JSON
      // being assembled a few characters at a time, and showing them would mean the
      // transcript fills with a broken argument string.
      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content;
        onDelta(delta.content);
      }

      for (const fragment of delta.tool_calls ?? []) {
        accumulateToolCall(calls, fragment);
      }
    }
  }

  return { content, toolCalls: finishToolCalls(calls) };
}

/**
 * Folds one streamed tool-call fragment into the call it belongs to.
 *
 * A tool call arrives across many chunks: the id and name usually in the first, the
 * arguments split wherever they fall. `index` is what ties them together — the id is not
 * present on the later fragments.
 */
function accumulateToolCall(calls, fragment) {
  const index = Number.isInteger(fragment?.index) ? fragment.index : calls.size;

  let call = calls.get(index);
  if (!call) {
    call = { id: '', type: 'function', function: { name: '', arguments: '' } };
    calls.set(index, call);
  }

  // Appended rather than assigned: some providers stream the name in fragments too, and
  // assigning would keep only the last piece of it.
  if (fragment.id) call.id += fragment.id;
  if (fragment.function?.name) call.function.name += fragment.function.name;
  if (fragment.function?.arguments) call.function.arguments += fragment.function.arguments;

  return call;
}

/** The assembled tool calls, in the order the model emitted them. */
function finishToolCalls(calls) {
  return [...calls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, call]) => ({ index, ...call }))
    .filter((call) => call.id && call.function.name);
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

// ---------------------------------------------------------------------------
// Port
// ---------------------------------------------------------------------------

/** `postMessage` throws once the far end is gone. A dead port needs no message. */
function post(port, payload) {
  try {
    port.postMessage(payload);
  } catch {
    // The page navigated or was closed mid-stream. The worker's job here is done.
  }
}
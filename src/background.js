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
 *
 * The loop below runs `round = 0 … MAX_TOOL_ROUNDS`. Rounds before the last may call tools;
 * the last request is sent with `tool_choice: "none"`, so the model gets exactly this many
 * tool rounds and then one request in which it is told it may not use any and has to answer
 * with what it already has. That last request is why the bound is inclusive.
 *
 * It used to be only a hope. The last request still offered the tools and said nothing, so a
 * model that kept searching — easily done, when the search backend is failing and the system
 * prompt says to search before answering — made seven requests and ended in an error with
 * nothing to show for them. Now the limit costs the model its tools, not the person their
 * answer. The error below remains for a model that ignores `tool_choice`, and names what it
 * called.
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

    // The keep-alive. Answering is the point: an inbound message is what resets Chrome's
    // idle timer, so the reply is what keeps this worker from being recycled while the
    // page is between sends. It does not extend a single request — Chrome caps that at
    // roughly five minutes whatever is sent to it — so a request stopped mid-stream is
    // recovered on the page by re-sending, not by this.
    if (message?.type === 'ping') {
      post(port, { type: 'pong' });
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
      // Not terminal: the request still ends in exactly one `done` or one `error`.
      (text) => post(port, { type: 'notice', requestId, text }),
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
async function converse(spec, onDelta, askPage, onNotice = () => {}) {
  const conversation = spec.conversation;

  /** The tools on offer. Dropped for the rest of the conversation if the model refuses them. */
  let tools = spec.tools;

  /** What the model has called so far, by name — for the error if it never stops. */
  const called = new Map();

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    // The last request the loop allows. Tools stay declared — a conversation that already holds
    // tool calls needs them declared on some providers — but the model may not use them.
    const lastChance = round === MAX_TOOL_ROUNDS && Boolean(tools?.length);

    const request = () =>
      streamChat(
        {
          model: spec.model,
          messages: conversation,
          tools,
          toolChoice: lastChance ? 'none' : undefined,
          signal: spec.signal,
        },
        onDelta,
      );

    let result;
    try {
      result = await request();
    } catch (err) {
      // Only the very first request, and only for this one reason. A model with no tool
      // support is refused before anything is generated, so asking again without tools is not
      // a second charge; any other failure, or the same one later on, is not this.
      if (round !== 0 || !tools?.length || !isToolSupportError(err)) throw err;

      tools = undefined;
      explainNoTools(conversation);
      onNotice(NO_TOOLS_NOTICE);
      result = await request();
    }

    const { content, toolCalls, finishReason, reasoningChars } = result;

    if (!toolCalls.length) {
      // No text and no tool call. Said here, where the stream's ending is known, because the page
      // only ever sees an empty string.
      if (!content.trim()) throw new Error(emptyAnswerMessage(finishReason, reasoningChars));
      return content;
    }

    if (round === MAX_TOOL_ROUNDS) {
      const summary = [...called].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(', ');
      throw new Error(
        `Stopped after ${MAX_TOOL_ROUNDS} rounds of tool calls without an answer` +
          `${summary ? ` (${summary})` : ''}.`,
      );
    }

    // The assistant turn is echoed back verbatim, tool_calls included, or the API
    // rejects the following `tool` message as not answering any call.
    conversation.push({
      role: 'assistant',
      content: content || null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      called.set(call.function.name, (called.get(call.function.name) ?? 0) + 1);

      const result = spec.pageTools.has(call.function.name)
        ? await askPageSafely(askPage, call)
        : await runNetworkToolSafely(call);

      conversation.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
  }

  throw new Error('The conversation did not produce an answer.');
}

/**
 * What to say when a request ended with nothing to show.
 *
 * Only what is known: a stream that carried nothing at all gets the plain sentence. A reasoning
 * model that spends its whole output budget thinking stops with `length` and a pile of
 * reasoning and no answer, which is a different problem from a model that said nothing, and the
 * two used to read the same.
 */
function emptyAnswerMessage(finishReason, reasoningChars) {
  const details = [];
  if (finishReason) details.push(`it stopped with "${finishReason}"`);
  if (reasoningChars) details.push(`${reasoningChars} characters of reasoning arrived but no answer`);

  return `The model returned an empty answer${details.length ? ` (${details.join('; ')})` : ''}.`;
}

/** What the page shows while a model with no tool support answers. Short: it sits in one line. */
const NO_TOOLS_NOTICE = 'no tool support — answering without search';

/**
 * What OpenRouter, and providers behind it, say when a model cannot take tools.
 *
 * Narrow on purpose. A wrong match hides a real error behind a silent downgrade, so each pattern
 * names tools and a lack of support together, within one sentence. A schema error that merely
 * mentions a tool, a missing model, or a bad key does not match any of them.
 */
const NO_TOOL_SUPPORT = [
  // OpenRouter: "No endpoints found that support tool use."
  /no endpoints found[^.]*\btools?\b/i,
  /\b(?:does not|doesn't|do not|don't) support[^.]*\btools?\b/i,
  /\btools?\b[^.]*\b(?:is|are) not (?:supported|enabled|available)\b/i,
  /\bfunction calling\b[^.]*\bnot (?:supported|enabled|available)\b/i,
];

/** Whether a failed request means "this model cannot use tools". */
function isToolSupportError(err) {
  return (
    [400, 404, 422].includes(err?.status) && NO_TOOL_SUPPORT.some((pattern) => pattern.test(err.message))
  );
}

/**
 * Tells a model that has no tools not to behave as though it had them.
 *
 * The system prompt says the model can search and read pages, and it is seeded once and never
 * refreshed, so it cannot be edited out of existing installs. A sentence appended to the copy
 * sent with this conversation does the job, for this conversation only.
 */
function explainNoTools(conversation) {
  const note =
    'This model cannot call tools here, so do not offer to search or read pages. If a question ' +
    'needs current information, say that you cannot look it up and answer from what you know.';

  if (conversation[0]?.role === 'system') {
    conversation[0] = { ...conversation[0], content: `${conversation[0].content}\n\n${note}` };
  } else {
    conversation.unshift({ role: 'system', content: note });
  }
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
async function streamChat({ model, messages, tools, toolChoice, signal }, onDelta) {
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
      // declares tools and also pins tool_choice. The one place it is pinned is the loop's last
      // request, as "none", which asks only that the model stop calling tools — a model or
      // provider that does not honour it is no worse off than before, and the loop's error
      // still catches it.
      ...(tools?.length ? { tools } : {}),
      ...(tools?.length && toolChoice ? { tool_choice: toolChoice } : {}),
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
 *
 * Throws if the provider reports an error inside the stream. See `providerError`.
 */
async function readSse(body, onDelta) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map();
  let buffer = '';
  let content = '';

  /** How the stream says it ended, and how much reasoning came with it — for an empty answer. */
  let finishReason = null;
  let reasoningChars = 0;

  const outcome = () => ({ content, toolCalls: finishToolCalls(calls), finishReason, reasoningChars });

  /** Handles one line of the stream. Returns true when it was the end-of-stream sentinel. */
  const handleLine = (rawLine) => {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) return false;

    const frame = line.slice(5).trim();
    if (!frame) return false;

    if (frame === DONE) return true;

    let parsed;
    try {
      parsed = JSON.parse(frame);
    } catch {
      // A frame we cannot parse is not worth failing the whole response over.
      return false;
    }

    const failure = providerError(parsed);
    if (failure) throw failure;

    const reason = parsed?.choices?.[0]?.finish_reason;
    if (reason) finishReason = reason;

    const delta = parsed?.choices?.[0]?.delta;
    if (!delta) return false;

    // A reasoning model streams its thinking apart from its answer, and the page never shows
    // it. It is counted, not kept: what matters is whether any arrived when the answer did not.
    if (typeof delta.reasoning === 'string') reasoningChars += delta.reasoning.length;

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

    return false;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      for (;;) {
        const newline = buffer.indexOf('\n');
        if (newline === -1) break;

        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);

        // The stream is over. Cancel so the connection is not left half-read; without
        // this the reader would sit until the server closes it.
        if (handleLine(line)) {
          await reader.cancel();
          return outcome();
        }
      }
    }

    // The body ended. Whatever is still in the buffer is a frame whose newline never came —
    // a provider that closes the connection straight after its last `data:` line. Dropping
    // it silently lost the end of the answer, with nothing to say anything was missing.
    buffer += decoder.decode();
    if (buffer.trim()) handleLine(buffer);
  } catch (err) {
    // A provider error, or a read that failed. Do not leave the connection half-read.
    await reader.cancel().catch(() => {});
    throw err;
  }

  return outcome();
}

/**
 * An error the provider reported inside the stream, or null.
 *
 * A request can be accepted, answered with 200 and a stream, and then fail partway: the
 * upstream provider drops, a quota trips, a moderation filter fires. OpenRouter reports
 * that as a `data:` frame carrying `error` (and `finish_reason: "error"`) rather than as
 * an HTTP status, because the status went out long ago. Without reading it, a failure
 * before any text looked like an empty answer, and one after some text returned the
 * truncated text as though it were complete.
 *
 * Only the provider's own message is used — never headers or the request, so the key
 * cannot reach it.
 */
function providerError(parsed) {
  const error = parsed?.error;
  if (error) {
    const reason = typeof error === 'string' ? error : error.message;
    return new Error(`The provider stopped the answer: ${reason || 'no reason was given'}.`);
  }

  if (parsed?.choices?.[0]?.finish_reason === 'error') {
    return new Error('The provider stopped the answer with an error and gave no reason.');
  }

  return null;
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

  // Providers differ on where the header goes. Most send the id and the name once, on the
  // first fragment, and the arguments after. Some send the id and the name again on every
  // fragment. A fragment that carries the id this call already has is the second kind: it
  // repeats the header, so appending it would turn "search_web" into "search_websearch_web"
  // and the id into three copies of itself, and the tool would never be found.
  const repeatsHeader = Boolean(fragment.id) && fragment.id === call.id;

  // Appended rather than assigned otherwise: some providers stream the name in fragments
  // too, and assigning would keep only the last piece of it. The cost of the id test is a
  // call whose id is itself streamed in pieces and happens to repeat — not seen, and no
  // worse than the failure it prevents.
  if (fragment.id && !repeatsHeader) call.id += fragment.id;
  if (fragment.function?.name && !repeatsHeader) call.function.name += fragment.function.name;
  if (fragment.function?.arguments) call.function.arguments += fragment.function.arguments;

  return call;
}

/**
 * The assembled tool calls, in the order the model emitted them.
 *
 * `index` is how fragments were matched up while streaming and is dropped here. These
 * objects are sent back to the provider as the assistant's own turn, where a call is
 * `{ id, type, function }` — a streaming-only field in a request is not part of that
 * shape, and strict providers reject what they do not recognise.
 */
function finishToolCalls(calls) {
  return [...calls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => call)
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
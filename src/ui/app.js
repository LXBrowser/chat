/**
 * app.js — entry point. Wires the panes together and nothing else.
 *
 * Load order matters and is deliberate:
 *
 *   1. the API-key gate resolves first, so the interface is never usable without a key
 *   2. settings load, then the multi-agent toggle and model picker are painted before
 *      they are wired
 *   3. the agent instructions are read
 *   4. the database opens and the history list is populated
 *   5. every control gets its listener
 *
 * Those numbers are not decoration: a failure in any of them is reported to the owner as
 * `Startup failed at <n> · <name>`, so this list and the step labels in `boot()` have to
 * stay in step with each other.
 *
 * Modules own their own data: `sessions` owns the database, `agents` owns the agent
 * registry, `views` owns the DOM, `openrouter` owns the port to the service worker. This
 * file only connects them.
 *
 * The OpenRouter call itself happens in `src/background.js`. This page sends a model and a
 * conversation and receives text back; it never sees the API key.
 */

import { TOOL_SCHEMAS } from '../tools.js';
import * as apiKey from './lib/api-key.js';
import * as agents from './lib/agents.js';
import * as instructions from './lib/instructions.js';
import * as openrouter from './lib/openrouter.js';
import { pageToolNames, runPageTool } from './lib/page-tools.js';
import * as sessions from './lib/sessions.js';
import * as storage from './lib/storage.js';
import * as views from './lib/views.js';

const $ = (id) => document.getElementById(id);

/** Mirrored UI settings, the single source of truth for the right pane. */
let settings = { multiAgentOn: false, agentLimit: 3, model: '', customModel: '' };

/**
 * One request at a time through the composer.
 *
 * Two concurrent sends would stream two answers into the same transcript. Released in a
 * `finally`, so a failure cannot leave the interface permanently disabled.
 */
let busy = false;

/**
 * What the composer is currently saying under the send button.
 *
 * Held outside the request because `finally` repaints the send state, and a failure
 * message repainted away in the same tick is a failure the user never sees.
 */
let sendNote = '';

// ---------------------------------------------------------------------------
// Status row
// ---------------------------------------------------------------------------

/**
 * What the agents are doing, and the state of the dot beside it.
 *
 * Held here rather than in `views` because it is composed from two sources — this, and the
 * running-agent count from the registry — and only the composition belongs in one place.
 * A field rather than a string, so the count can be re-read without losing the text.
 */
let activity = { text: 'Idle', running: false, done: false };

/**
 * Repaints the status row from the current activity and the live agent count.
 *
 * The count is appended to the text rather than held in a badge of its own: there is one
 * row and it says everything, which is what makes "it never grows a second line" a property
 * of the design rather than a promise.
 */
function paintActivity() {
  const running = agents.activeCount();
  const count = running ? `${running} running` : '';
  views.setActivity(count ? `${activity.text} · ${count}` : activity.text, activity);
}

/**
 * Sets what the agents are doing. The text changes in place; no row is ever added.
 *
 * @param {string} text
 * @param {{running?: boolean, done?: boolean}} [state]
 */
function setActivity(text, state) {
  activity = { text, running: false, done: false, ...state };
  paintActivity();
}

/** A readable phrase for a tool the main agent has just asked for. */
function toolActivity(name) {
  switch (name) {
    case 'search_web': return 'Searching…';
    case 'read_page': return 'Reading…';
    case 'update_chat_title': return 'Naming this chat…';
    default: return `${name}…`;
  }
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

/**
 * The Main Agent's instructions.
 *
 * Loaded at boot from `agent_instructions`, seeded on first run from
 * `src/prompts/system-instructions.md`. This constant is only the fallback for a load
 * that fails outright — the seeded copy is what normally gets sent.
 */
const MAIN_SYSTEM_FALLBACK =
  'You are the main agent in a chat workspace. You have search_web, read_page and ' +
  'update_chat_title available. Answer the user directly, and use the tools rather than ' +
  'guessing at anything you were not told.';

/** The Main Agent's system prompt, resolved once at boot. */
let systemPrompt = MAIN_SYSTEM_FALLBACK;

/**
 * A sub-agent's standing instructions.
 *
 * Sub-agents get **no tools** — deliberately. Each answers one focused task and its output
 * is read on its own in the log; a fan-out where every agent could search would multiply
 * the cost of a single prompt for nothing, since there is no synthesis step to combine the
 * results.
 */
const SUBAGENT_SYSTEM =
  'You are a sub-agent in a chat workspace. You have been given one task. Answer it ' +
  'directly and concisely — at most a short paragraph — because your answer is read on its ' +
  'own, with no other context and no step to combine it with anything else.';

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/**
 * The boot step that failed, or null while boot is healthy.
 *
 * Held at module scope because the report is written by the caller: `boot()` rejects, and
 * the handler that turns that into something readable lives outside it. A step name is
 * what turns "Cannot read properties of undefined" into an address — without it, the only
 * honest thing the page can say is the message, and the message does not say where.
 */
let failedStep = null;

/**
 * Runs one numbered step of `boot()`, recording its name if it throws.
 *
 * The step is named, not just numbered, because the number alone sends the reader back to
 * the boot comment to find out what it was. The tag is attached to the original error and
 * rethrown unchanged, so a `catch` further down still sees the same `err.message` it would
 * have seen without this.
 */
async function step(label, fn) {
  try {
    return await fn();
  } catch (err) {
    failedStep = label;
    throw err;
  }
}

async function boot() {
  // 1. Gate. Nothing below runs without a key, so nothing below can be half-wired
  //    when the user has not configured anything yet.
  //
  //    Deliberately not wrapped in `step()`. Cancelling the gate is a decision, not a
  //    fault, and the message for it is the gate's own — tagging it "step 1 failed"
  //    would tell the owner their browser is broken when they simply said no.
  await apiKey.requireApiKey();

  // 2. Settings.
  await step('2 · settings', async () => {
    settings = await storage.getSettings();
    views.renderMultiAgent(settings);
    views.renderModel(settings);
    views.renderSendState({ busy });
  });

  // 3. Instructions. Seeded here rather than on the first send, so `agent_instructions`
  //    is populated on first run and a seeding problem surfaces at boot where it can be
  //    seen, instead of failing in the middle of a conversation.
  await step('3 · instructions', async () => {
    systemPrompt = await instructions.get();
  });

  // 4. Database. A first run has no sessions, so one is created rather than showing
  //    an empty pane the user has no obvious way out of.
  await step('4 · history', async () => {
    await sessions.openMostRecentOrCreate();
    await refreshConversation();
  });

  // 5. Wiring.
  await step('5 · controls', async () => {
    wireConversation();
    wireComposer();
    wireMultiAgent();
    wireModel();
  });

  // The registry is the source of truth for how many agents are running, so one
  // subscription keeps the count in the status row live — there is no separate
  // "agent finished" path to forget.
  agents.subscribe(paintActivity);
  paintActivity();
}

/** Redraws everything derived from the conversation. */
async function refreshConversation() {
  await Promise.all([views.renderHistory(), views.renderTranscript(), views.renderTitle()]);
}

// ---------------------------------------------------------------------------
// Left pane
// ---------------------------------------------------------------------------

function wireConversation() {
  // The database is the source of truth for sessions, so *any* change repaints the
  // pane. Nothing below calls refreshConversation() directly — one subscription is
  // both simpler and avoids two overlapping repaints racing to render stale data.
  //
  // Serialised, and the serialisation is load-bearing. Two repaints can be in flight at
  // once — each awaits the database before it rebuilds — and the slower one then writes
  // its older snapshot over the newer one. That is not merely a stale render: if the
  // older snapshot was read before an answer was stored, it repaints the transcript
  // without that answer, and the answer the user is watching disappears.
  //
  // A change arriving mid-repaint is not dropped: it sets `repaintAgain`, and the
  // repaint drains once more before it stops. Coalescing rather than dropping is what
  // keeps the count right — a burst of writes becomes one extra repaint, not none.
  let repainting = false;
  let repaintAgain = false;

  const repaint = async () => {
    repainting = true;
    try {
      while (repaintAgain) {
        repaintAgain = false;
        await refreshConversation();
      }
    } finally {
      repainting = false;
    }
  };

  sessions.onChange(() => {
    repaintAgain = true;
    if (!repainting) void repaint();
  });

  // Open a different chat.
  $('history').addEventListener('click', async (event) => {
    const del = event.target.closest('[data-delete-session-id]');
    if (del) {
      const id = del.dataset.deleteSessionId;
      if (!confirm('Delete this chat and every message in it?')) return;
      await sessions.deleteSession(id);
      // Deleting the open session leaves the pane empty; open another so it is not stuck.
      if (!sessions.current()) await sessions.openMostRecentOrCreate();
      return;
    }

    const item = event.target.closest('[data-session-id]');
    if (item) await sessions.openSession(item.dataset.sessionId);
  });

  document.querySelector('[data-action="new-chat"]').addEventListener('click', async () => {
    await sessions.createSession();
  });
}

// ---------------------------------------------------------------------------
// Right pane — composer and files
// ---------------------------------------------------------------------------

function wireComposer() {
  const prompt = $('prompt');

  const send = async () => {
    const content = prompt.value.trim();
    if (!content || busy) return;

    busy = true;
    sendNote = 'Calling OpenRouter…';
    views.renderSendState({ busy, note: sendNote });

    try {
      // The chat this send belongs to, fixed now. Everything below — the title, the stored
      // turns, the context, the answer, a tool's rename — is about this chat, not about
      // whichever one is open when it happens. A reply takes seconds, and the history list
      // stays clickable the whole time.
      const sessionId = sessions.current();
      if (!sessionId) throw new Error('No chat is open to send to.');

      // Derive a title from the first prompt, so the history list is not a column of
      // "New Chat". Only if the title has not been set deliberately.
      const session = await sessions.getSession(sessionId);
      if (session && session.title === 'New Chat') {
        await sessions.renameSession(sessionId, content.slice(0, 60));
      }

      prompt.value = '';

      // Recorded before the request, so the context sent back to the model includes the
      // turn being answered — and so an interrupted answer still leaves the prompt in
      // the history.
      await sessions.appendMessage('user', content, sessionId);

      const history = await conversationContext(sessionId);

      // Sub-agents run alongside the Main Agent, not before it. Their failures are logged
      // in their own agents, so this only rejects if the fan-out itself cannot be built —
      // caught here so it cannot surface as an unhandled rejection while the Main Agent is
      // still streaming.
      const subAgents = settings.multiAgentOn
        ? delegate(content, history).catch((err) => {
            console.error('Sub-agent fan-out failed:', err.message);
          })
        : Promise.resolve();

      await runMainAgent(history, sessionId);
      await subAgents;

      // Cleared only on the way through: a failure leaves its message showing.
      sendNote = '';
    } catch (err) {
      // The request failed, so the reason belongs under the Send button rather than only
      // in an agent's log. `runMainAgent()` rethrows for exactly this; a tool that fails
      // mid-run does not reach here, because the worker hands the failure back to the
      // model as a failed tool result and the conversation continues.
      sendNote = err.message;
      console.error('Send failed:', err.message);
    } finally {
      busy = false;
      views.renderSendState({ busy, note: sendNote });
      prompt.focus();
    }
  };

  $('send-btn').addEventListener('click', send);

  document.querySelector('[data-action="clear-composer"]').addEventListener('click', () => {
    prompt.value = '';
    prompt.focus();
  });

  // Ctrl/Cmd+Enter sends; a bare Enter adds a newline.
  prompt.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void send();
    }
  });

  // --- Files ------------------------------------------------------------
  const dropzone = $('dropzone');
  const fileInput = $('file-input');

  const addFiles = (files) => {
    const list = $('file-list');
    for (const file of files) {
      const item = document.createElement('li');
      item.className = 'dropzone__file';
      item.textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} kB`;
      list.append(item);
    }
  };

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', () => addFiles(fileInput.files));

  for (const type of ['dragenter', 'dragover']) {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add('is-over');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    dropzone.addEventListener(type, () => dropzone.classList.remove('is-over'));
  }
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  });

  // --- Title ------------------------------------------------------------
  const titleInput = $('chat-title');
  const savedFlag = $('title-saved');

  const commitTitle = async () => {
    const value = titleInput.value.trim();
    if (!value || value === (await sessions.getCurrent())?.title) return;
    try {
      await sessions.renameCurrent(value);
      savedFlag.classList.add('is-visible');
      setTimeout(() => savedFlag.classList.remove('is-visible'), 1400);
    } catch (err) {
      console.warn('Rename failed:', err.message);
    }
  };

  titleInput.addEventListener('change', commitTitle);
  titleInput.addEventListener('blur', commitTitle);

  // --- Settings ---------------------------------------------------------
  document.querySelector('[data-action="open-settings"]').addEventListener('click', async () => {
    await apiKey.changeApiKey();
  });
}

// ---------------------------------------------------------------------------
// Right pane — multi-agent toggle and model picker
// ---------------------------------------------------------------------------

function wireMultiAgent() {
  const toggle = $('multiagent-toggle');
  const limit = $('agent-limit');

  toggle.addEventListener('click', async () => {
    settings = await storage.saveSettings({ multiAgentOn: !settings.multiAgentOn });
    views.renderMultiAgent(settings);
  });

  limit.addEventListener('change', async () => {
    // normaliseLimit coerces to a whole number of at least 1, so a cleared or
    // nonsensical field lands on a valid value instead of being rejected in place.
    settings = await storage.saveSettings({ agentLimit: limit.value });
    views.renderMultiAgent(settings);
  });
}

function wireModel() {
  const select = $('model-select');
  const custom = $('model-custom');

  const save = async () => {
    settings = await storage.saveSettings({
      model: select.value,
      customModel: custom.value,
    });
    views.renderModel(settings);
  };

  select.addEventListener('change', save);
  // Saved on change rather than per keystroke, but before blur is missed: the custom
  // field is typed into and then clicked away from without ever firing `change` in
  // some flows.
  custom.addEventListener('change', save);
  custom.addEventListener('blur', save);
}

// ---------------------------------------------------------------------------
// Running agents
// ---------------------------------------------------------------------------

/**
 * The conversation so far, in the shape OpenRouter expects.
 *
 * Read after the new prompt is stored, so the turn being answered is included. Empty
 * content is dropped rather than sent: some providers reject an empty message outright.
 *
 * Of the chat that is being answered, which is not necessarily the one open by now.
 */
async function conversationContext(sessionId) {
  const messages = await sessions.listMessages(sessionId);
  return messages
    .filter((m) => m.content && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Runs the Main Agent: one streamed answer, saved and shown.
 *
 * It is a registry agent like any other, so it appears in the centre dropdown while it
 * works and leaves it when it finishes. That is the whole of the "active until complete"
 * behaviour — the registry already guarantees it.
 *
 * Rejects on a failed request, having left the agent marked failed and whatever partial
 * answer arrived on screen.
 *
 * Only the Main Agent gets tools. The worker runs the network ones and forwards
 * `update_chat_title` back here, because renaming touches the database and the title bar,
 * and neither is reachable from the worker.
 *
 * `sessionId` is the chat that asked. The answer is written to it and a title tool renames
 * it, wherever the person has navigated to in the meantime.
 */
async function runMainAgent(history, sessionId) {
  const model = storage.effectiveModel(settings);
  const agent = agents.spawn({ name: 'Main Agent', task: summarise(history) });

  const handle = views.startStream(sessionId);
  setActivity('Working…', { running: true });

  // Set once, on the first chunk. Re-running it per delta would rewrite the same text
  // hundreds of times for no visible difference — the row changes in place either way.
  let streaming = false;

  // True once a retry has produced its first chunk. The interrupted attempt's text is
  // cleared at that point rather than when the retry starts, so the answer is on screen
  // for the whole of the reconnect instead of blinking empty.
  let restarted = false;

  const spec = {
    model,
    system: systemPrompt,
    messages: history,
    tools: TOOL_SCHEMAS,
    pageTools: pageToolNames(),
    onDelta: (delta) => {
      // A retry re-sends the whole conversation, so the model answers from the beginning
      // again. Leaving the interrupted text underneath would store two answers
      // concatenated into one message.
      if (restarted) {
        restarted = false;
        views.clearStream(handle);
      }

      if (!streaming) {
        streaming = true;
        setActivity('Writing…', { running: true });
      }
      views.pushDelta(handle, delta);
    },
    onToolCall: (call) => {
      streaming = false;
      setActivity(toolActivity(call.name), { running: true });
    },
    onTool: (name, args) => runPageTool(name, parseArgs(args), { sessionId }),
  };

  try {
    let answer;
    try {
      answer = await openrouter.chat(spec);
    } catch (err) {
      // One retry, and only for a worker that went away mid-answer. A request the worker
      // answered — a 401, an exhausted balance, an empty response — is re-asking a
      // question that has already been answered, and would spend a call to be refused
      // the same way.
      if (!openrouter.isRetryable(err)) throw err;

      // Said out loud, because it costs money. A retry the user cannot see is a silent
      // re-bill, and this one is triggered by a failure they are watching happen.
      setActivity('Reconnecting…', { running: true });
      restarted = true;
      streaming = false;
      answer = await openrouter.chat(spec);
    }

    // Checked before the agent finishes: an empty answer is a failure, and reporting it
    // after `finish` would find the agent already out of the active list, so nothing
    // would show.
    if (!answer.trim()) throw new Error('The model returned an empty answer.');

    // The chat can be deleted while its answer is on the way. Said before the agent
    // finishes, for the same reason as the empty answer above, and so the status row never
    // reads "Answer ready" for an answer with nowhere to go. Filing it under whichever chat
    // happens to be open instead would put it in a conversation that never asked.
    if (!(await sessions.getSession(sessionId))) {
      throw new Error('This chat was deleted before the answer arrived.');
    }

    agents.finish(agent.id);
    setActivity('Answer ready', { done: true });

    // Before the write, not after: storing repaints the transcript from the database, and
    // the streamed copy has to be gone before that repaint or the answer appears twice.
    views.discardStream();
    await sessions.appendMessage('assistant', answer, sessionId);
  } catch (err) {
    agents.fail(agent.id);
    // Nothing was stored, so whatever arrived stays on screen — a partial answer is still
    // more use than an empty bubble.
    views.endStream();
    setActivity('Failed');
    // Rethrown, and this is the whole fix. Swallowing it here meant `send()` reached its
    // `sendNote = ''` on the way through and reported success: a 401, a 402, an empty
    // answer and a dead worker all presented as a Send that did nothing. The reason is
    // shown under the Send button now, which is where someone who just pressed it is
    // looking.
    throw err;
  }
}

/**
 * Fans a prompt out across sub-agents, up to the configured cap.
 *
 * Each is a real OpenRouter request with its own answer. There is no synthesis step:
 * their results are not written to the transcript, and only the running count reaches
 * the status row.
 *
 * @returns {Promise<void>} resolves when every sub-agent has settled — each settles on
 * its own, so one failure never takes the others down.
 */
async function delegate(prompt, history) {
  const model = storage.effectiveModel(settings);
  const cap = storage.normaliseLimit(settings.agentLimit);
  const names = ['Researcher', 'Coder', 'Critic', 'Summarizer', 'Planner', 'Tester'];

  // Each sub-agent gets the prompt as its own single-turn task. Sending the whole
  // conversation would have them each re-answer what the Main Agent is already doing.
  const messages = [{ role: 'user', content: prompt }];

  await Promise.all(
    Array.from({ length: cap }, (_, i) =>
      runSubAgent({
        name: `${names[i % names.length]} ${i + 1}`,
        prompt,
        messages,
        model,
      }),
    ),
  );
}

/**
 * One sub-agent, start to finish.
 *
 * Never rejects: a sub-agent that failed is information about the fan-out, not an error
 * in the page, and the Main Agent is still streaming. Its only effect on the interface
 * is the running count, which the registry already keeps live.
 */
async function runSubAgent({ name, prompt, messages, model }) {
  const agent = agents.spawn({ name, task: prompt.slice(0, 40) });

  try {
    const answer = await openrouter.chat({
      model,
      system: SUBAGENT_SYSTEM,
      messages,
    });

    agents.finish(agent.id);
  } catch {
    agents.fail(agent.id);
  }
}

/** Puts something short and readable in the dropdown's task chip. */
function summarise(history) {
  const last = history[history.length - 1];
  return last ? last.content.slice(0, 40) : '';
}

/**
 * Parses a tool's arguments for the page-side runner.
 *
 * The worker hands over the raw argument string, because that is what the model produced
 * and what it will be checked against. A parse failure becomes an empty object: the tool
 * then reports the missing argument itself, which is a better error than a JSON error from
 * a layer the model knows nothing about.
 */
function parseArgs(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/**
 * Why this page cannot start, or null when it can.
 *
 * Two faults look identical from the outside — a `TypeError` about `local` beside a
 * Send button — and they are not the same problem, so they are named separately. The
 * fix for one does nothing for the other, which is what made the first diagnosis go
 * looking for an extension-context problem that was not there.
 */
function startupFault() {
  // The new-tab page is served from the extension origin, so this should be true. It is
  // checked rather than assumed because `src/ui/index.html` also opens from a file://
  // path, where `window.chrome` exists but carries none of the APIs.
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    return 'This page is not running as an extension page, so it cannot reach Chrome ' +
           'APIs. Open it as a new tab with the extension enabled, not from a file.';
  }

  // In Manifest V3 Chrome only injects `chrome.storage` when "storage" is declared in
  // the manifest's `permissions`. Undeclared it is `undefined`, so `storage.local.get()`
  // throws on the first call — and so does every read the service worker makes of the
  // key, which is why nothing had ever reached OpenRouter either.
  if (!chrome.storage?.local) {
    return 'This extension does not declare the "storage" permission, so Chrome has not ' +
           'made chrome.storage available. Reload the extension at chrome://extensions.';
  }

  return null;
}

// The check runs before boot() rather than inside it, so a manifest fault is reported
// as itself rather than surfacing as whatever the first storage call happened to throw.
const fault = startupFault();

if (fault) {
  // No reload is offered here, and that is deliberate: the fault is in the manifest, so
  // reloading lands on exactly this same page with exactly this same problem.
  const status = $('send-status');
  status.hidden = false;
  status.textContent = fault;

  // Nothing below is wired, so Send would be a button that does nothing. Disabled beats
  // enabled-and-inert, which is what the previous run looked like.
  $('send-btn').disabled = true;
} else {
  // Called last, so every declaration above is defined before boot runs — a module
  // that started itself mid-file would be relying on hoisting it does not get for
  // `const` bindings.
  //
  // The only rejection boot() can produce is the API-key gate, and only when the
  // user cancels it. Steps 2–5 never run in that case, which means the Settings
  // button has no listener: without the catch below, cancelling would leave a page
  // that looks alive and does nothing, with no way to add a key and start over.
  //
  // Reaching here means `startupFault()` found nothing, so a reload has a real chance
  // of helping: it re-runs boot from the top and re-opens the gate.
  boot().catch((err) => {
    const status = $('send-status');
    status.hidden = false;
    // The step name first, because it is the part that says where to look. The message
    // alone is the part that was already on screen and was not enough to act on.
    status.textContent = failedStep
      ? `Startup failed at ${failedStep}: ${err.message}`
      : err.message;

    document.querySelector('[data-action="open-settings"]').addEventListener(
      'click',
      () => window.location.reload(),
      { once: true },
    );
  });
}
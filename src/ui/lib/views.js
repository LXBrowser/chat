/**
 * views.js — DOM rendering for the three panes.
 *
 * Kept separate from the modules that own the data, so `agents.js` and `sessions.js`
 * stay testable without a DOM and this file stays about pixels rather than state.
 */

import * as agents from './agents.js';
import * as sessions from './sessions.js';
import { MODEL_PRESETS, effectiveModel } from './storage.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

/** Replaces an element's children with `nodes`. */
function render(node, ...nodes) {
  node.replaceChildren(...nodes);
  return node;
}

/**
 * Builds an element from a props object.
 *
 * `dataset` is unpacked rather than assigned. `HTMLElement.dataset` is declared
 * `[SameObject] readonly attribute DOMStringMap` — it has no setter — so `Object.assign(node,
 * { dataset: { … } })` throws in a strict-mode module rather than writing anything. Every
 * caller here passed an object, which made `renderHistory()` die on its first element and
 * took `boot()` down with it.
 *
 * Keys are camelCase and `DOMStringMap` does the `data-kebab-case` conversion, so
 * `{ dataset: { sessionId } }` lands as `data-session-id` — the name `app.js` selects on.
 */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (key === 'dataset') {
      for (const [dataKey, dataValue] of Object.entries(value)) {
        node.dataset[dataKey] = dataValue;
      }
    } else {
      node[key] = value;
    }
  }

  node.append(...children);
  return node;
}

/** Escapes nothing — sets textContent, so message content is never parsed as HTML. */
function text(str) {
  return document.createTextNode(str);
}

// ---------------------------------------------------------------------------
// Left pane — history and transcript
// ---------------------------------------------------------------------------

/**
 * The message currently being written, or null.
 *
 * A streaming answer is not in the database yet, so it exists only in the DOM. Anything
 * that repaints the transcript has to carry it across.
 */
let stream = null;

/** Redraws the history list from the database. */
export async function renderHistory() {
  const list = $('history');
  const all = await sessions.listSessions();
  const active = sessions.current();

  if (!all.length) {
    render(list, el('p', { className: 'lead', textContent: 'No chats yet.' }));
    return;
  }

  render(
    list,
    // The row is a container, not a button: it holds two buttons, and nesting
    // interactive elements inside a <button> is invalid and breaks keyboard use.
    ...all.map((s) =>
      el(
        'div',
        { className: `history__item${s.id === active ? ' is-active' : ''}` },
        el('button', {
          type: 'button',
          className: 'history__name',
          title: s.title,
          dataset: { sessionId: s.id },
          textContent: s.title,
        }),
        el('button', {
          type: 'button',
          className: 'history__del',
          title: 'Delete chat',
          'aria-label': `Delete ${s.title}`,
          dataset: { deleteSessionId: s.id },
          textContent: '×',
        }),
      ),
    ),
  );
}

/** Redraws the transcript for the open session. */
export async function renderTranscript() {
  const pane = $('transcript');
  const messages = await sessions.listMessages();

  if (!messages.length) {
    render(
      pane,
      el(
        'div',
        { className: 'empty', id: 'transcript-empty' },
        el('p', { textContent: 'No messages yet.' }),
        el('p', { className: 'lead', textContent: 'Write a prompt on the right and send it.' }),
      ),
    );
    return;
  }

  // A response can be arriving while the transcript is repainted for another reason — a
  // rename, a session switch. The in-flight node is not in the database yet, so it has to
  // be carried across the redraw or the text the user is watching vanishes mid-answer.
  //
  // Captured before the rebuild, because `render` detaches everything, and re-checked
  // against the current value afterwards: if the answer completed while this repaint was
  // waiting on the database, the stored copy is now in `nodes` and re-appending the
  // streamed one would show the same answer twice.
  const live = stream;

  const nodes = messages.map((m) =>
    el(
      'div',
      { className: `msg${m.role === 'user' ? ' msg--user' : ''}` },
      el('span', { className: 'msg__role', textContent: m.role }),
      el('div', { className: 'msg__body' }, text(m.content)),
    ),
  );

  render(pane, ...nodes);

  if (live && live === stream) pane.append(live);

  pane.scrollTop = pane.scrollHeight;
}

// ---------------------------------------------------------------------------
// Left pane — streaming
// ---------------------------------------------------------------------------

/**
 * Opens a streaming assistant message and returns a handle for `pushDelta`.
 *
 * An empty placeholder is appended immediately so the first chunk has somewhere to land;
 * an answer that takes a moment to start would otherwise look like nothing happened.
 */
export function startStream() {
  const pane = $('transcript');
  $('transcript-empty')?.remove();

  const body = el('div', { className: 'msg__body' });
  stream = el(
    'div',
    { className: 'msg msg--streaming' },
    el('span', { className: 'msg__role', textContent: 'assistant' }),
    body,
  );

  pane.append(stream);
  pane.scrollTop = pane.scrollHeight;

  return { body };
}

/** Appends one chunk. Text nodes throughout, so streamed content is never parsed as HTML. */
export function pushDelta(handle, chunk) {
  if (!handle || !chunk) return;
  handle.body.append(text(chunk));

  const pane = $('transcript');
  // Only follow the stream if the reader has not scrolled up to read something.
  const atBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 48;
  if (atBottom) pane.scrollTop = pane.scrollHeight;
}

/**
 * Closes the streaming message without removing it — the streaming caret goes, whatever
 * arrived stays, so a partial answer is still readable after a failure.
 *
 * A message that never received any text is removed rather than left as an empty bubble:
 * an answer that failed before its first chunk should not look like an answer.
 */
export function endStream() {
  const node = stream;
  stream = null;
  if (!node) return;

  node.classList.remove('msg--streaming');
  if (!node.querySelector('.msg__body').textContent) node.remove();
}

/**
 * Drops the streaming node entirely because its text is about to be stored.
 *
 * Called **before** the write, not after. The write repaints the transcript from the
 * database, so clearing the reference first is what guarantees that repaint sees no
 * streaming node and cannot show the same answer twice.
 */
export function discardStream() {
  const node = stream;
  stream = null;
  node?.remove();
}

/** Writes the open session's title into the title input. */
export async function renderTitle() {
  const input = $('chat-title');
  const session = await sessions.getCurrent();

  if (!session) {
    input.value = '';
    input.disabled = true;
    return;
  }
  input.disabled = false;
  input.value = session.title;
}

// ---------------------------------------------------------------------------
// Centre pane — agent dropdown and log
// ---------------------------------------------------------------------------

/**
 * Redraws the dropdown from `agents.list()`, which holds only running agents.
 *
 * A finished agent is therefore absent here without this function doing anything about
 * it. If `selectedId` is no longer in the list, the selection falls back to the first
 * running agent — so watching one agent finish moves you to another rather than to an
 * empty pane.
 */
export function renderAgents(selectedId) {
  const running = agents.list();
  const menu = $('agent-select-menu');
  const trigger = $('agent-select-trigger');
  $('agent-count-badge').textContent =
    `${running.length} running`;

  if (!running.length) {
    render(
      menu,
      el('li', {
        className: 'agent-select__empty',
        textContent: 'No agents running.',
      }),
    );
    trigger.textContent = 'No agent selected';
    return;
  }

  const selected = running.find((a) => a.id === selectedId) ?? running[0];
  trigger.textContent = selected.name;

  render(
    menu,
    ...running.map((a) =>
      el(
        'li',
        { role: 'none' },
        el(
          'button',
          {
            type: 'button',
            role: 'option',
            className: `agent-select__option${a.id === selected.id ? ' is-selected' : ''}`,
            dataset: { agentId: a.id },
            'aria-selected': String(a.id === selected.id),
          },
          el('span', { className: 'dot dot--running', 'aria-hidden': 'true' }),
          el('span', { textContent: a.name }),
          el('span', { className: 'chip', textContent: a.task.slice(0, 22) }),
        ),
      ),
    ),
  );

  return selected;
}

/** Writes an agent's log into the centre pane. */
export function renderLog(agentId) {
  $('agent-log').textContent = agentId
    ? agents.logLines(agentId) || '(no output yet)'
    : 'Waiting for an agent.';
}

// ---------------------------------------------------------------------------
// Right pane — multi-agent toggle
// ---------------------------------------------------------------------------

/**
 * Paints the toggle and syncs the limit input's disabled state.
 *
 * State is carried by `aria-pressed` and by the label text as well as by colour — a
 * red/green pill alone fails anyone who cannot distinguish the two hues. See
 * `.agents/design/extension-adaptation.md`.
 */
export function renderMultiAgent({ multiAgentOn, agentLimit }) {
  const btn = $('multiagent-toggle');
  const label = $('multiagent-label');
  const count = $('agent-limit');

  btn.setAttribute('aria-pressed', String(multiAgentOn));
  // Colour is a stylesheet rule keyed off aria-pressed, not an assignment here:
  // the manifest's `style-src 'self'` forbids the style attribute, and a tint set
  // in JS can drift from the state it is supposed to be representing. `data-on`
  // went with it — two attributes mirroring one state is the same drift, slower.
  label.textContent = multiAgentOn ? 'Multi-agent ON' : 'Multi-agent OFF';

  count.disabled = !multiAgentOn;
  count.value = String(agentLimit);
  count.setAttribute('min', '1');
}

// ---------------------------------------------------------------------------
// Right pane — model picker
// ---------------------------------------------------------------------------

/**
 * Paints the model dropdown and the custom-id field.
 *
 * The hint names the model that will actually be sent, because the two controls do not
 * look like they interact: someone who typed a custom id has no other way to tell whether
 * the dropdown still counts.
 */
export function renderModel(settings) {
  const select = $('model-select');
  const custom = $('model-custom');
  const hint = $('model-effective-hint');

  render(
    select,
    ...MODEL_PRESETS.map((id) =>
      el('option', { value: id, textContent: id, selected: id === settings.model }),
    ),
  );

  // A stored id that is no longer a preset still has to be shown, or the select would
  // silently fall back to the first option and send something the user did not pick.
  if (settings.model && !MODEL_PRESETS.includes(settings.model)) {
    select.append(el('option', { value: settings.model, textContent: settings.model, selected: true }));
  }

  custom.value = settings.customModel ?? '';

  const effective = effectiveModel(settings);
  hint.textContent = settings.customModel
    ? `Sending “${effective}” — the custom id overrides the dropdown.`
    : `Sending “${effective}”.`;
}

// ---------------------------------------------------------------------------
// Right pane — send state
// ---------------------------------------------------------------------------

/**
 * Locks the composer while a request is in flight.
 *
 * A second send would open a second stream into the same transcript, interleaving two
 * answers into one message. Disabling the button is the honest version of that: the input
 * is still there and the send state is visible.
 */
export function renderSendState({ busy, note = '' }) {
  const send = $('send-btn');
  send.disabled = busy;
  send.textContent = busy ? 'Waiting…' : 'Send';

  const status = $('send-status');
  if (!status) return;
  status.textContent = note;
  status.hidden = !note;
}
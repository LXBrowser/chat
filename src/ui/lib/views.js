/**
 * views.js — DOM rendering for the three panes.
 *
 * Kept separate from the modules that own the data, so `sessions.js` stays testable
 * without a DOM and this file stays about pixels rather than state.
 *
 * Pane assignment: the left pane is the chat history, the centre pane is the model picker,
 * the status row and the conversation stream, and the right pane is everything you compose
 * with. The transcript used to live in the left pane above the history, which is why
 * `#transcript` is here and why nothing in this file has to know where it is — every
 * renderer targets it by id.
 */

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
// Left pane — history
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

  // A response can be arriving while the transcript is repainted for another reason — a
  // rename, a session switch. The in-flight node is not in the database yet, so it has to
  // be carried across the redraw or the text the user is watching vanishes mid-answer.
  //
  // Captured before the rebuild, because `render` detaches everything, and re-checked
  // against the current value afterwards: if the answer completed while this repaint was
  // waiting on the database, the stored copy is now in `nodes` and re-appending the
  // streamed one would show the same answer twice.
  const live = stream;

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

    // Carried across here too, and the omission was the bug: this branch returned
    // without it, so a repaint against an empty session destroyed the streaming bubble
    // and left `stream` pointing at a detached node. Every delta after that was appended
    // into nothing — the answer kept arriving and the user saw none of it.
    if (live && live === stream) pane.append(live);

    return;
  }

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
// Centre pane — streaming
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
  setStreaming(true);

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
 * Empties the streaming message but keeps its bubble.
 *
 * Used once, when a retried request produces its first chunk. The retry re-sends the
 * whole conversation, so the model regenerates the answer from the beginning — leaving
 * the interrupted attempt's text in place would concatenate two answers into one message
 * and store both. The bubble stays so the pane does not blink between attempts.
 */
export function clearStream(handle) {
  if (!handle) return;
  handle.body.replaceChildren();
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
  setStreaming(false);
  if (!node) return;

  node.classList.remove('msg--streaming');
  if (!node.querySelector('.msg__body').textContent) node.remove();
}

/**
 * Gives up ownership of the streaming node because its text is about to be stored.
 *
 * Called **before** the write, not after. The write repaints the transcript from the
 * database, so clearing the reference first is what guarantees that repaint sees no
 * streaming node and cannot show the same answer twice.
 *
 * **It no longer removes the node, and that is the whole fix.** It used to. The write
 * that repaints the transcript is asynchronous — IndexedDB, then a repaint — so removing
 * synchronously left the answer off screen for the whole of that gap. Observed by
 * mutation rather than inferred: the transcript went from two messages holding 48
 * characters, to one holding 5, and back again. A completed answer blinking out of
 * existence and returning is what "messages seem to disappear" looks like, and it
 * happened on **every** successful send.
 *
 * Clearing `stream` while leaving the node in place gives the repaint exactly what it
 * needs: `renderTranscript` sees no live node to carry across, so its rebuild replaces
 * this one with the stored copy. Nothing is removed by hand and nothing has to wait.
 *
 * It also means a failed write leaves the answer on screen. `endStream()` is a no-op once
 * `stream` is null, so the partial or complete text the user watched stream stays readable
 * instead of being taken away at the moment it stops being guaranteed.
 */
export function discardStream() {
  stream = null;
  setStreaming(false);
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
// Centre pane — the single status row
// ---------------------------------------------------------------------------

/**
 * Sets the status row, in place.
 *
 * This is the whole of the agent-status surface, and the constraint is that it stays one
 * row: `textContent` is assigned to the node that is already there, and nothing is ever
 * appended. The append-only log it replaced could not do this — accumulating lines is all
 * it was for — which is why it had to be a different signal and not a view of the same one.
 *
 * @param {string} text   What to show. Replaces whatever was there.
 * @param {object} [state]
 * @param {boolean} [state.running] Accent dot — work is in flight.
 * @param {boolean} [state.done]   Green dot — work finished.
 */
export function setActivity(text, { running = false, done = false } = {}) {
  $('activity-text').textContent = text;
  $('activity-dot').className = `dot${running ? ' dot--running' : ''}${done ? ' dot--done' : ''}`;
}

/** Marks the transcript busy while an answer is arriving. */
export function setStreaming(streaming) {
  $('transcript').setAttribute('aria-busy', String(streaming));
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
/**
 * views.js — DOM rendering for the three panes.
 *
 * Kept separate from the modules that own the data, so `agents.js` and `sessions.js`
 * stay testable without a DOM and this file stays about pixels rather than state.
 */

import * as agents from './agents.js';
import * as sessions from './sessions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

/** Replaces an element's children with `nodes`. */
function render(node, ...nodes) {
  node.replaceChildren(...nodes);
  return node;
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
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

  render(
    pane,
    ...messages.map((m) =>
      el(
        'div',
        { className: `msg${m.role === 'user' ? ' msg--user' : ''}` },
        el('span', { className: 'msg__role', textContent: m.role }),
        el('div', { className: 'msg__body' }, text(m.content)),
      ),
    ),
  );

  pane.scrollTop = pane.scrollHeight;
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
  const dot = $('multiagent-dot');

  btn.setAttribute('aria-pressed', String(multiAgentOn));
  btn.dataset.on = String(multiAgentOn);
  btn.style.color = multiAgentOn ? 'var(--ok)' : 'var(--sponsor)';
  dot.style.background = multiAgentOn ? 'var(--ok)' : 'var(--sponsor)';
  label.textContent = multiAgentOn ? 'Multi-agent ON' : 'Multi-agent OFF';

  count.disabled = !multiAgentOn;
  count.value = String(agentLimit);
  count.setAttribute('min', '1');
}
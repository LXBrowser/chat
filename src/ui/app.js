/**
 * app.js — entry point. Wires the panes together and nothing else.
 *
 * Load order matters and is deliberate:
 *
 *   1. the API-key gate resolves first, so the interface is never usable without a key
 *   2. settings load, then the multi-agent toggle is painted before it is wired
 *   3. the database opens and the history list is populated
 *   4. every control gets its listener
 *
 * Modules own their own data: `sessions` owns the database, `agents` owns the agent
 * registry, `views` owns the DOM. This file only connects them.
 */

import * as apiKey from './lib/api-key.js';
import * as agents from './lib/agents.js';
import * as sessions from './lib/sessions.js';
import * as storage from './lib/storage.js';
import * as views from './lib/views.js';

const $ = (id) => document.getElementById(id);

/** The agent the centre pane is showing. Not persisted — agents do not outlive the tab. */
let selectedAgentId = null;

/** Mirrored UI settings, the single source of truth for the right pane. */
let settings = { multiAgentOn: false, agentLimit: 3 };

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  // 1. Gate. Nothing below runs without a key, so nothing below can be half-wired
  //    when the user has not configured anything yet.
  await apiKey.requireApiKey();

  // 2. Settings.
  settings = await storage.getSettings();
  views.renderMultiAgent(settings);

  // 3. Database. A first run has no sessions, so one is created rather than showing
  //    an empty pane the user has no obvious way out of.
  await sessions.openMostRecentOrCreate();
  await refreshConversation();

  // 4. Wiring.
  wireConversation();
  wireAgents();
  wireComposer();
  wireMultiAgent();

  // The registry is the source of truth for the dropdown, so one subscription drives
  // both the list and the log — there is no separate "agent finished" path to forget.
  agents.subscribe(paintAgents);
  paintAgents();
}

/** Repaints the centre pane from the registry. */
function paintAgents() {
  const selected = views.renderAgents(selectedAgentId);
  // When the watched agent leaves the list, fall back rather than showing nothing.
  selectedAgentId = selected ? selected.id : null;
  views.renderLog(selectedAgentId);
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
  sessions.onChange(() => {
    void refreshConversation();
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
// Centre pane — the dropdown
// ---------------------------------------------------------------------------

function wireAgents() {
  const trigger = $('agent-select-trigger');
  const menu = $('agent-select-menu');

  const closeMenu = () => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };

  const openMenu = () => {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  };

  trigger.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));

  // Escape closes, and focus leaving the widget closes it — no click-away handler
  // needed, and it stays keyboard-operable.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      closeMenu();
      trigger.focus();
    }
  });

  $('agent-select').addEventListener('focusout', (event) => {
    if (!$('agent-select').contains(event.relatedTarget)) closeMenu();
  });

  menu.addEventListener('click', (event) => {
    const option = event.target.closest('[data-agent-id]');
    if (!option) return;
    selectedAgentId = option.dataset.agentId;
    const selected = views.renderAgents(selectedAgentId);
    selectedAgentId = selected ? selected.id : null;
    views.renderLog(selectedAgentId);
    closeMenu();
  });
}

// ---------------------------------------------------------------------------
// Right pane — composer and files
// ---------------------------------------------------------------------------

function wireComposer() {
  const prompt = $('prompt');

  const send = async () => {
    const content = prompt.value.trim();
    if (!content) return;

    // Derive a title from the first prompt, so the history list is not a column of
    // "New Chat". Only if the title has not been set deliberately.
    const session = await sessions.getCurrent();
    if (session && session.title === 'New Chat') {
      const derived = content.slice(0, 60);
      await sessions.renameCurrent(derived);
    }

    prompt.value = '';
    await sessions.appendMessage('user', content);

    if (settings.multiAgentOn) await delegate(content);
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
// Right pane — multi-agent toggle
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

/**
 * Fans a prompt out across sub-agents, up to the configured cap.
 *
 * This is the mock the centre pane observes: agents appear in the dropdown, log as they
 * work, and leave it when they finish. It replaces an OpenRouter round-trip in the next
 * phase.
 */
async function delegate(prompt) {
  const cap = settings.agentLimit;
  const names = ['Researcher', 'Coder', 'Critic', 'Summarizer', 'Planner', 'Tester'];

  for (let i = 0; i < cap; i += 1) {
    const agent = agents.spawn({
      name: `${names[i % names.length]} ${i + 1}`,
      task: prompt.slice(0, 40),
    });
    agents.simulate(agent.id, { intervalMs: 700 + i * 250 });
  }
}

// ---------------------------------------------------------------------------

boot().catch((err) => {
  // The API-key gate is the one rejection that reaches here: the user cancelled.
  console.error(err.message);
  document.getElementById('prompt').disabled = true;
  document.getElementById('send-btn').disabled = true;
});
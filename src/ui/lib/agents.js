/**
 * agents.js — the sub-agent registry behind the centre pane.
 *
 * The contract that matters here: **`list()` returns only agents that are still
 * running.** An agent leaves the list the moment it finishes, and the dropdown re-renders
 * from `list()` — so auto-remove is a property of the registry, not something the UI has
 * to remember to do. A missed removal is not possible, because there is no removal
 * step for the UI to miss.
 *
 * Logs outlive the agent: a finished agent leaves `active` but keeps its log, so the
 * pane can still show what happened to the agent you were watching.
 */

let nextId = 1;

/** id -> agent, for agents still running. */
const active = new Map();

/** id -> string[], kept after an agent finishes. */
const logs = new Map();

/** id -> the agent record, kept after it finishes. */
const records = new Map();

const listeners = new Set();

/** Notifies subscribers. Called after every mutation. */
function emit() {
  for (const fn of listeners) fn();
}

/** Registers a listener. @returns {() => void} unsubscribe */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Starts an agent.
 *
 * @param {{name: string, task: string}} spec
 * @returns {{id: string, name: string, task: string, startedAt: number}}
 */
export function spawn({ name, task }) {
  const id = `agent-${nextId++}`;
  const agent = { id, name, task, startedAt: Date.now(), status: 'running' };

  active.set(id, agent);
  records.set(id, agent);
  logs.set(id, [`▸ ${name} started — ${task}`]);
  emit();
  return agent;
}

/** Appends a line to a running agent's log. Ignored once it has finished. */
export function log(id, line) {
  if (!active.has(id)) return false;
  logs.get(id)?.push(line);
  emit();
  return true;
}

/**
 * Finishes an agent, removing it from the active list.
 *
 * Idempotent: finishing an already-finished agent is a no-op returning null, so a late
 * timer cannot resurrect or double-count one.
 *
 * @returns {object|null} the finished agent, or null if it was already gone.
 */
export function finish(id, summary) {
  const agent = active.get(id);
  if (!agent) return null;

  agent.status = 'done';
  logs.get(id)?.push(`✓ ${agent.name} finished${summary ? ` — ${summary}` : ''}`);
  active.delete(id);
  emit();
  return agent;
}

/** Marks an agent failed. Same removal semantics as `finish`. */
export function fail(id, reason) {
  const agent = active.get(id);
  if (!agent) return null;

  agent.status = 'error';
  logs.get(id)?.push(`✗ ${agent.name} failed — ${reason}`);
  active.delete(id);
  emit();
  return agent;
}

/** Only the agents still running. This is what the dropdown renders. */
export function list() {
  return [...active.values()];
}

export function get(id) {
  return records.get(id) ?? null;
}

/** The log for an agent, finished or not. Empty string when there is none. */
export function logLines(id) {
  return (logs.get(id) ?? []).join('\n');
}

/** How many are running — the count badge. */
export function activeCount() {
  return active.size;
}

/** Whether an id is still running. */
export function isActive(id) {
  return active.has(id);
}

/** Ends every running agent. Used on unload so nothing outlives the page. */
export function clear() {
  active.clear();
  emit();
}

// ---------------------------------------------------------------------------
// Mock execution
// ---------------------------------------------------------------------------

/** Interval handles, so no timer outlives the page. */
const timers = new Set();

/**
 * Simulates an agent working, then finishing.
 *
 * This is the stand-in for a real OpenRouter round-trip. It exists so the dropdown's
 * auto-remove behaviour is observable end to end before the model client exists — which
 * is the whole point of landing the UI first.
 *
 * @param {string} id agent to simulate
 * @param {{steps?: string[], intervalMs?: number, failAt?: number}} opts
 *        `failAt` makes step *n* fail instead, to exercise the error path.
 */
export function simulate(id, { steps, intervalMs = 900, failAt = -1 } = {}) {
  const plan = steps ?? ['reading context', 'drafting', 'verifying'];
  let i = 0;

  const timer = setInterval(() => {
    if (i >= plan.length) {
      clearInterval(timer);
      finish(id, 'task complete');
      return;
    }

    const step = plan[i];
    if (i === failAt) {
      clearInterval(timer);
      fail(id, step);
      return;
    }

    log(id, `· ${step}`);
    i += 1;
  }, intervalMs);

  // Do not outlive the page: a timer outliving its agent is a leak.
  timers.add(timer);
  return () => clearInterval(timer);
}

window.addEventListener('pagehide', () => {
  for (const t of timers) clearInterval(t);
  timers.clear();
});
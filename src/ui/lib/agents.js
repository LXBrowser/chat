/**
 * agents.js — the sub-agent registry behind the status row.
 *
 * The contract that matters here: **`list()` returns only agents that are still
 * running.** An agent leaves the list the moment it finishes, and the status row reads
 * the count from here — so auto-remove is a property of the registry, not something the
 * UI has to remember to do. A missed removal is not possible, because there is no removal
 * step for the UI to miss.
 *
 * There is no longer a per-agent log. It was an append-only `<pre>`, which by definition
 * grows a line per event, and the centre pane now carries a single status row whose text
 * changes in place — the two cannot be the same surface. The status row gets everything
 * an agent says from `setActivity()`; the registry keeps the lifecycle and the count, and
 * nothing about an agent that has finished.
 */

let nextId = 1;

/** id -> agent, for agents still running. */
const active = new Map();

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
  emit();
  return agent;
}

/**
 * Finishes an agent, removing it from the active list.
 *
 * Idempotent: finishing an already-finished agent is a no-op returning null, so a late
 * timer cannot resurrect or double-count one.
 *
 * @returns {object|null} the finished agent, or null if it was already gone.
 */
export function finish(id) {
  const agent = active.get(id);
  if (!agent) return null;

  agent.status = 'done';
  active.delete(id);
  emit();
  return agent;
}

/** Marks an agent failed. Same removal semantics as `finish`. */
export function fail(id) {
  const agent = active.get(id);
  if (!agent) return null;

  agent.status = 'error';
  active.delete(id);
  emit();
  return agent;
}

/** Only the agents still running. */
export function list() {
  return [...active.values()];
}

/** How many are running — the count in the status row. */
export function activeCount() {
  return active.size;
}
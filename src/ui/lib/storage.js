/**
 * storage.js — thin wrapper over `chrome.storage.local`.
 *
 * `local`, not `sync`: `sync` uploads its contents to Google's servers, and this holds an
 * API credential. See `wiki/environments/env.md`.
 *
 * Every function rejects rather than throwing synchronously, so callers can treat
 * storage exactly like the rest of the async surface in this extension.
 */

const API_KEY = 'openrouter_api_key';
const SETTINGS = 'settings';

/** Stored UI preferences. Defaults are applied on read, not on write. */
const DEFAULT_SETTINGS = {
  multiAgentOn: false,
  agentLimit: 3,
};

// ---------------------------------------------------------------------------
// API key
// ---------------------------------------------------------------------------

/** @returns {Promise<string|null>} the stored key, or null when none is set. */
export async function getApiKey() {
  const stored = await chrome.storage.local.get(API_KEY);
  const key = stored[API_KEY];
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

/**
 * Stores a key, rejecting an empty one rather than clearing it by accident —
 * clearing is `clearApiKey()`.
 */
export async function setApiKey(key) {
  const clean = String(key ?? '').trim();
  if (!clean) throw new Error('API key cannot be empty');
  await chrome.storage.local.set({ [API_KEY]: clean });
  return clean;
}

export async function clearApiKey() {
  await chrome.storage.local.remove(API_KEY);
}

/** Replaces the stored key. The settings surface calls this. */
export async function replaceApiKey(key) {
  await clearApiKey();
  return setApiKey(key);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Reads the stored settings, filling in any key that is missing or malformed. */
export async function getSettings() {
  const { [SETTINGS]: stored } = await chrome.storage.local.get(SETTINGS);
  const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  return {
    multiAgentOn: Boolean(merged.multiAgentOn),
    agentLimit: normaliseLimit(merged.agentLimit),
  };
}

/**
 * Merges `patch` into the stored settings.
 *
 * `agentLimit` is normalised on the way in, so an out-of-range value written by a
 * previous version cannot leave the UI showing something the runtime will not honour.
 */
export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch, agentLimit: normaliseLimit(patch.agentLimit ?? current.agentLimit) };
  await chrome.storage.local.set({ [SETTINGS]: next });
  return next;
}

/**
 * Coerces a limit to a whole number of at least 1.
 *
 * @returns {number} always valid — callers do not need to re-check.
 */
export function normaliseLimit(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}
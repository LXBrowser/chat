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

/**
 * Models offered in the picker.
 *
 * A fixed list rather than a fetched catalogue: `/models` is one more API surface to keep
 * working, and the escape hatch is the custom field next to the dropdown. An id that is
 * wrong or unavailable fails at request time and says so — see
 * `wiki/environments/env.md`.
 *
 * Declared before DEFAULT_SETTINGS, which reads it — a const used above its own
 * declaration is a runtime error, not a warning.
 */
export const MODEL_PRESETS = ['openai/gpt-4o-mini', 'deepseek/deepseek-v4-flash'];

/** Stored UI preferences. Defaults are applied on read, not on write. */
const DEFAULT_SETTINGS = {
  multiAgentOn: false,
  agentLimit: 3,
  model: MODEL_PRESETS[0],
  customModel: '',
};

/**
 * The model actually sent to OpenRouter: the custom id when one is typed, otherwise the
 * dropdown. Exported so the interface and the request agree on one rule.
 */
export function effectiveModel({ model, customModel } = {}) {
  const custom = String(customModel ?? '').trim();
  if (custom) return custom;
  const chosen = String(model ?? '').trim();
  return chosen || MODEL_PRESETS[0];
}

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
    model: typeof merged.model === 'string' && merged.model.trim()
      ? merged.model.trim()
      : DEFAULT_SETTINGS.model,
    customModel: typeof merged.customModel === 'string' ? merged.customModel.trim() : '',
  };
}

/**
 * Merges `patch` into the stored settings.
 *
 * `agentLimit` is normalised on the way in, so an out-of-range value written by a
 * previous version cannot leave the UI showing something the runtime will not honour. The
 * model fields are normalised the same way — a stored value that is not a model id must
 * not reach a request.
 */
export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };

  next.agentLimit = normaliseLimit(next.agentLimit);

  const model = typeof next.model === 'string' ? next.model.trim() : '';
  next.model = model || current.model;

  next.customModel = typeof next.customModel === 'string' ? next.customModel.trim() : '';

  await chrome.storage.local.set({ [SETTINGS]: next });
  return getSettings();
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
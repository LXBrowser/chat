/**
 * api-key.js — the blocking OpenRouter key gate.
 *
 * The modal is in the markup and hidden. On load, a missing key reveals it and
 * **blocks the rest of the app** — `app.js` awaits `requireApiKey()` before it wires
 * anything, so there is no window in which the interface is usable without a key.
 *
 * The modal is opaque, per `.agents/design/overlay-opacity.md`: it covers the entire
 * interface and nothing behind it may be readable.
 */

import * as storage from './storage.js';

const $ = (id) => document.getElementById(id);

/** Resolves once a key is stored. Rejects only if the user cancels. */
export function requireApiKey() {
  return storage.getApiKey().then((key) => {
    if (key) return key;
    return promptForKey();
  });
}

/** Shows the modal and resolves with the stored key. Rejects on cancel. */
export function promptForKey() {
  return new Promise((resolve, reject) => {
    const modal = $('api-key-modal');
    const input = $('api-key-input');
    const error = $('api-key-error');

    // Every listener this call adds is torn down together, so opening the modal a
    // second time cannot leave the previous call's save handler attached.
    const abort = new AbortController();
    const { signal } = abort;

    input.value = '';
    error.textContent = '';
    modal.hidden = false;
    input.focus();

    const close = () => {
      modal.hidden = true;
      abort.abort();
    };

    async function onSave(event) {
      event.preventDefault();
      try {
        const saved = await storage.setApiKey(input.value);
        close();
        resolve(saved);
      } catch (err) {
        error.textContent = err.message;
      }
    }

    modal.querySelector('[data-action="save-key"]')
      .addEventListener('click', onSave, { signal });
    modal.querySelector('[data-action="cancel-key"]')
      .addEventListener('click', () => {
        close();
        reject(new Error('No API key — the extension cannot talk to OpenRouter'));
      }, { signal });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void onSave(event);
    }, { signal });
  });
}

/**
 * Replaces the stored key, from the settings surface.
 *
 * Cancelling is not an error here — unlike the first-run gate, refusing to replace a key
 * you already have is a legitimate choice, not a failure. So the stored key is read first
 * and returned on cancel, and there is no separate branch for "nothing stored yet": with
 * nothing stored, cancelling resolves to null and `requireApiKey` opens the gate anyway.
 */
export async function changeApiKey() {
  const saved = await storage.getApiKey();
  try {
    return await promptForKey();
  } catch {
    return saved;
  }
}
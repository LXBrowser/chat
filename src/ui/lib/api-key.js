/**
 * api-key.js — the blocking OpenRouter key gate, and the settings-side edit flow.
 *
 * The modal is in the markup and hidden. On load, a missing key reveals it and
 * **blocks the rest of the app** — `app.js` awaits `requireApiKey()` before it wires
 * anything, so there is no window in which the interface is usable without a key.
 *
 * The modal is opaque, per `.agents/design/overlay-opacity.md`: it covers the entire
 * interface and nothing behind it may be readable.
 *
 * **The stored key never enters this module.** `storage.getApiKey()` is deleted; only
 * `hasApiKey()` is called, and it returns a boolean. When a key is stored the input shows
 * a constant mask, so there is nothing to read out of the DOM either. The key is read in
 * exactly one place — `background.js`'s own context — and never crosses the port.
 *
 * Two states, and the difference is the whole point:
 *
 * | | no key stored | key stored |
 * |---|---|---|
 * | input | empty, editable | `readonly`, showing the constant mask |
 * | primary | **Save key** | **Update key**, disabled until **Edit** |
 * | extra | — | **Edit** button beside the field |
 *
 * Writing happens on exactly one path: the primary button, and only with a value the
 * person typed. Cancel writes nothing at all and restores whatever state the modal was
 * in when it opened.
 */

import * as storage from './storage.js';

const $ = (id) => document.getElementById(id);

/**
 * What the input shows when a key is stored.
 *
 * A constant, chosen to look like the real thing and to be worth nothing. It is not
 * derived from the stored value, its length, or its tail — a mask that varies reveals the
 * length of the secret, and one derived from the secret at all would mean the secret was
 * in this function.
 */
const MASK = 'sk-or-v1-••••••••••••••••';

/** Resolves once a key is stored. Rejects only if the user cancels. */
export function requireApiKey() {
  return storage.hasApiKey().then((has) => {
    if (has) return true;
    return promptForKey({ hasKey: false });
  });
}

/**
 * Shows the modal and resolves once a key is stored. Rejects on cancel.
 *
 * `hasKey` selects the state, and it is the one thing that does: a key exists → locked
 * behind Edit, nothing to type. No key → empty and editable. It is passed rather than read
 * here so this function never asks storage anything, and therefore never has a path to the
 * value even if one were added to `hasApiKey` tomorrow.
 *
 * @param {{hasKey: boolean}} options
 * @returns {Promise<boolean>}
 */
export function promptForKey({ hasKey }) {
  return new Promise((resolve, reject) => {
    const modal = $('api-key-modal');
    const input = $('api-key-input');
    const error = $('api-key-error');
    const primary = modal.querySelector('[data-action="save-key"]');
    const editBtn = modal.querySelector('[data-action="edit-key"]');
    const hint = $('api-key-hint');
    const eyebrow = $('api-key-eyebrow');
    const leadNew = $('api-key-lead-new');
    const leadSaved = $('api-key-lead-saved');

    // Every listener this call adds is torn down together, so opening the modal a
    // second time cannot leave the previous call's save handler attached.
    const abort = new AbortController();
    const { signal } = abort;

    let locked = false;

    /**
     * Whether a key exists — which decides the framing, and nothing else.
     *
     * Kept separate from `setState` on purpose. Editing an existing key and setting one
     * for the first time differ only in the lock; the modal still says "Settings" and
     * still explains that a key is stored, because one is. Folding this into `setState`
     * made clicking Edit re-announce the modal as first-run setup with nothing stored,
     * which is the opposite of what is happening.
     */
    const applyFraming = () => {
      // Two paragraphs are toggled rather than one rewritten, because the first-run copy
      // carries a <code> element that assigning textContent would delete.
      eyebrow.textContent = hasKey ? 'Settings' : 'One-time setup';
      leadNew.hidden = hasKey;
      leadSaved.hidden = !hasKey;
    };

    /** Whether the field is editable. `Edit` moves it, and nothing else does. */
    const setState = (isLocked) => {
      locked = isLocked;
      input.readOnly = isLocked;
      input.value = isLocked ? MASK : '';
      input.placeholder = isLocked ? '' : 'sk-or-v1-…';
      editBtn.hidden = !isLocked;
      primary.textContent = hasKey ? 'Update key' : 'Save key';
      primary.disabled = isLocked;
      // The hint explains the mask, so it is only shown while the mask is showing.
      hint.hidden = !isLocked;
    };

    /** Unlocks the field. Everything typed from here replaces the key. */
    const unlock = () => {
      setState(false);
      input.focus();
    };

    applyFraming();
    setState(hasKey);
    error.textContent = '';
    modal.hidden = false;
    if (!hasKey) input.focus();

    const close = () => {
      modal.hidden = true;
      abort.abort();
    };

    async function onPrimary(event) {
      event.preventDefault();
      if (locked) return;   // the Edit button is the only way out of the locked state
      try {
        await storage.setApiKey(input.value);
        close();
        resolve(true);
      } catch (err) {
        error.textContent = err.message;
      }
    }

    primary.addEventListener('click', onPrimary, { signal });
    editBtn.addEventListener('click', unlock, { signal });
    modal.querySelector('[data-action="cancel-key"]')
      .addEventListener('click', () => {
        close();
        reject(new Error('No API key — the extension cannot talk to OpenRouter'));
      }, { signal });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      // Enter follows the primary action, which means it does nothing while locked —
      // otherwise it would save the mask back over a working key.
      if (!locked) void onPrimary(event);
    }, { signal });
  });
}

/**
 * Replaces the stored key, from the settings surface.
 *
 * Cancelling is not an error here — unlike the first-run gate, refusing to replace a key
 * you already have is a legitimate choice, not a failure. So it resolves either way, and
 * nothing is written unless the primary button was clicked.
 */
export async function changeApiKey() {
  try {
    return await promptForKey({ hasKey: await storage.hasApiKey() });
  } catch {
    return false;
  }
}
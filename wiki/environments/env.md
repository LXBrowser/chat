# Environment

What the extension needs from its environment, and where each value lives.

## OpenRouter API key

The extension talks to OpenRouter, which requires an API key. **The key is stored in the
browser, in `chrome.storage.local`** — never in the repository, never in a build file, and
never committed.

### Getting one

1. Sign in at <https://openrouter.ai>.
2. Create a key under **API Keys**.
3. Copy it. It is shown once.

### Supplying it

At `0.1.0` the key flow is not wired. The interface is on the page: the blocking modal
that appears when no key is stored, and the settings surface for replacing one. Both are
markup only until the OpenRouter client is written.

When it is wired, the behaviour will be:

* On load, check `chrome.storage.local` for a key.
* If none is stored, show the blocking modal. Nothing else in the app runs until one is.
* The modal accepts a paste, validates it against OpenRouter, and stores it under
  `chrome.storage.local`.
* Settings replaces a stored key without requiring a reload.

### Handling the key

* **Never commit it.** `.gitignore` is the backstop, not the plan — do not paste a key
  into a file in the first place.
* **Never log it.** A key in DevTools or a console dump is a leaked key.
* **Scope it.** OpenRouter keys can be created with a credit limit. Set one.
* **Rotating it** is done at OpenRouter, then replaced in settings. Nothing local caches
  it beyond `chrome.storage.local`.

## Models

Model identifiers are stored and passed in `{platform}/{model}` form, lowercase — the
shape OpenRouter itself uses. See the `model_naming_convention` tool declared in
`AGENTS.md`.

No model is hard-coded at `0.1.0`. The main agent and sub-agent model choices belong to the
settings surface, and the multi-agent count is the number input on the right pane.

## Permissions

The manifest at `0.1.0` declares **no permissions**. It is a full-page override and needs
none to load.

The search-and-read tool will need `host_permissions` for the URLs it fetches, and a
background service worker to do the fetching. Both arrive with that tool — not before.
Adding a permission earlier means asking users to approve one the extension does not use.

## IndexedDB origin

Chat history lives in IndexedDB under the extension's own origin, isolated from any website
you visit. Clearing extension data at `chrome://extensions` deletes every session and
message. There is no sync and no export.
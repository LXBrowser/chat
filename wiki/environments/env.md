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

The flow is wired:

* On load, the page checks `chrome.storage.local` for a key.
* If none is stored, a blocking modal appears. Nothing else in the app runs until one is.
* The modal accepts a paste and stores it under `chrome.storage.local`.
* **Settings** replaces a stored key without a reload.

The paste is *not* validated against OpenRouter before being stored. Doing that costs a
request and gives a slower first-run; the first real send is where a bad key surfaces, and
it surfaces with OpenRouter's own error.

### Handling the key

* **Never commit it.** `.gitignore` is the backstop, not the plan — do not paste a key
  into a file in the first place.
* **Never log it.** A key in DevTools or a console dump is a leaked key.
* **Scope it.** OpenRouter keys can be created with a credit limit. Set one.
* **Rotating it** is done at OpenRouter, then replaced in settings. Nothing local caches
  it beyond `chrome.storage.local`.
* **It never enters the page.** `src/background.js` reads the key from storage in the
  worker's own context and uses it in the `Authorization` header. The key is never sent
  over the message port, so it cannot appear in the DOM, in a devtools dump, or in an
  error message shown in the interface.

## Models

Model identifiers are stored and passed in `{platform}/{model}` form, lowercase — the
shape OpenRouter itself uses. See the `model_naming_convention` tool declared in
`AGENTS.md`.

The right pane carries a **model picker**: a dropdown of the presets, and a text field that
overrides it when it has a value. Both are stored under `settings` in
`chrome.storage.local`; the model actually sent is the custom id when one is typed,
otherwise the dropdown, otherwise `openai/gpt-4o-mini`.

| Preset | Note |
|---|---|
| `openai/gpt-4o-mini` | The default. Cheap and fast, which matters while the extension is being developed against a live bill. |
| `deepseek/deepseek-v4-flash` | **Unverified.** The id is used exactly as given and has not been confirmed against OpenRouter's catalogue. If it is wrong, the request fails at send time with the provider's error, not silently. |

The custom field exists precisely so a wrong or unavailable preset is not a dead end — type
any OpenRouter `{platform}/{model}` id and it is sent instead.

There is no settings surface for choosing the Main Agent and sub-agents *separately*: both
use the selected model.

## Permissions

The manifest declares one host permission and no API permissions:

```json
"host_permissions": ["https://openrouter.ai/*"]
```

That is the minimum the model layer needs, and it is why the service worker exists — the
worker makes the cross-origin request so the page never has to. No `activeTab`, no
`tabs`, no `scripting`, no `<all_urls>`.

The search-and-read tool will need `host_permissions` for the URLs it fetches. Those
arrive with that tool.

## Service worker

`src/background.js` is registered as an MV3 module service worker. Chrome terminates it
when idle; the page's port reconnects on the next request, so termination is invisible
except that the in-flight request it was serving is lost.

One limit worth knowing: Chrome caps a single request at roughly five minutes regardless
of activity. A response longer than that is cut mid-stream and arrives as an error rather
than a completion.

## IndexedDB origin

Chat history lives in IndexedDB under the extension's own origin, isolated from any website
you visit. Clearing extension data at `chrome://extensions` deletes every session and
message. There is no sync and no export.
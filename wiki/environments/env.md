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
* **Settings** replaces a stored key without a reload. Cancelling leaves the stored key
  alone — refusing to replace a key you already have is a legitimate choice, not a failure.
  There is no "forget this key" control.

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

## Outbound requests

The service worker is the only thing that makes cross-origin requests. It has three kinds,
and they need different hosts granted:

| Request | Host permission | Why it can be narrow |
|---|---|---|
| Model completions | `https://openrouter.ai/*` | One known API. |
| Web search | `https://html.duckduckgo.com/*` | One known search endpoint. |
| Resolving a hostname | `https://cloudflare-dns.com/*` | The `read_page` guard asks one resolver where a name points. |
| Reading a page | `https://*/*` | The URL comes from search results, so it cannot be enumerated in advance. |

```json
"permissions": [
  "storage"
],

"host_permissions": [
  "https://openrouter.ai/*",
  "https://html.duckduckgo.com/*",
  "https://cloudflare-dns.com/*",
  "https://*/*"
]
```

No browsing permissions — no `activeTab`, no `tabs`, no `scripting`.

### `storage` is required, not optional

The two arrays do different jobs and `storage` is the one that breaks the loudest when it
goes missing. `host_permissions` decide which hosts the worker may fetch; `storage` decides
whether `chrome.storage` exists **at all**.

In Manifest V3 Chrome injects the `chrome.storage` namespace only when it is declared in
`permissions`. Undeclared it is `undefined` rather than degraded, so
`chrome.storage.local.get()` throws `TypeError: Cannot read properties of undefined
(reading 'local')` on the first call, with no warning at load time and no partial
behaviour. It affects the page and the service worker equally, since both read through it.

The key lives in `chrome.storage.local` and **not** `sync`, which uploads its contents to
Google's servers — wrong for a credential. `storage` does not grant that: `local` is local
unless `sync` is asked for by name.

### `https://*/*` is a broad grant

The last permission is the one to look at before loading the extension. It lets the worker
fetch **any https URL the model names** — which means any URL a web page managed to put in
front of the model, including one crafted to look like an internal host. Chrome will warn
about this at install time. It is granted deliberately, because `read_page` is useless
without it, but the safeguards live in the tool rather than in the permission.

Before every hop — **including every redirect hop** — `read_page`:

* accepts **https only**;
* **resolves the hostname and checks the addresses**, refusing anything that is not
  publicly routable: the loopback, private, link-local and reserved IPv4 ranges,
  `169.254.0.0/16` where cloud metadata lives, and every IPv6 address outside the single
  globally routable range `2000::/3` — including `::ffff:127.0.0.1` and the other ways an
  IPv4 address can be dressed up as IPv6;
* refuses a bare hostname or a `.local` / `.internal` name outright;
* **fails closed** if the resolver is unreachable or reports nothing, rather than reading a
  host it could not check;
* bounds the download at 5 MB by content-length, before the body is read;
* refuses a content type with no readable text.

Resolution goes through DNS-over-HTTPS rather than a plain lookup, because the guard trusts
the answer and a plain lookup can be forged by whatever is on the path. The trade is that
Cloudflare sees the hostname — which it largely does anyway as the network's resolver.

These are guards, not a sandbox. A tool that fetches model-supplied URLs is the standard
prompt-injection shape, and the instruction file tells the Main Agent to treat page content
as data rather than instructions.

### The search parser is the fragile part

`search_web` uses DuckDuckGo's HTML endpoint because it needs no API key, which means
there is no contract behind it — the extension parses someone else's markup. If search
starts returning nothing, `parseSearchResults` in `src/tools.js` is where to look, and it
fails by design with a message that says whether it was an empty result or a parse failure,
because those two look identical from the model's side.

## Service worker

`src/background.js` is registered as an MV3 module service worker. Chrome terminates it
when idle; the page's port reconnects on the next request, so termination is invisible
except that the in-flight request it was serving is lost.

One limit worth knowing: Chrome caps a single request at roughly five minutes regardless
of activity. A response longer than that is cut mid-stream and arrives as an error rather
than a completion. A response that uses tools counts against the same budget — the loop's
own limit is six tool rounds, so it gives up with an explanation rather than hanging until
Chrome kills it.

## IndexedDB origin

Chat history lives in IndexedDB under the extension's own origin, isolated from any website
you visit. Clearing extension data at `chrome://extensions` deletes every session and
message. There is no sync and no export.
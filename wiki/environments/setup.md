# Setup

There is nothing to install and nothing to build. The repository is loaded unpacked.

## Requirements

* Google Chrome, or a Chromium browser that supports Manifest V3.
* Roughly 40 MB of free disk — Chrome keeps the unpacked directory.

## Load the extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the **repository root** — the directory containing `manifest.json`, not `src/`.
5. Confirm the extension appears in the list as `@lxbrowser/chat` with no errors.

The manifest declares two kinds of permission. `host_permissions` cover OpenRouter, DuckDuckGo, a
DNS resolver, and `https://*/*`; the `storage` permission is what makes `chrome.storage` exist
at all. Chrome shows a permission warning on the card for `https://*/*` — that is expected.
It is granted so the built-in `read_page` tool can fetch the URLs search returns, and
[Environment](env.md) explains what that grant does and does not allow.

**`storage` is not optional.** In Manifest V3 Chrome only injects `chrome.storage` when it
is declared in `permissions`. Without it the namespace is `undefined`, every read of the API
key and every setting throws, and the page shows an error under the Send button. The
service worker reads the key through the same namespace, so nothing reaches OpenRouter
either.

## Open it

Open a **new tab**. The extension overrides the new tab page, so the three panes load in
place of the usual Chrome start page.

To get the old new tab back, disable the extension at `chrome://extensions`, or press
`Alt`+`Ctrl`+`N` for a plain new window.

## Why `file://` will not work

Opening `src/ui/index.html` directly from disk fails, and the console will say so. ES
modules and IndexedDB both require a real origin, and `file://` is not one. Always go
through **Load unpacked** and the new-tab override.

## After changing files

Chrome does not reload unpacked extensions automatically. Press the reload icon on the
extension card at `chrome://extensions` after every change, then **open a new tab** — an
already-open new-tab page keeps the old HTML, CSS and JavaScript, so reloading the card
alone looks like nothing happened. A hard reload (`Ctrl`+`Shift`+`R`) forces the
stylesheet too.

If something you changed does not appear, check that you are seeing current CSS before
concluding the change did not work:

```js
getComputedStyle(document.querySelector('.composer')).gap   // '6px' — current
```

## Check the page has its permissions

Run this in the DevTools console on a **new** tab, before anything else. It is the fastest
way to tell a manifest fault from anything else, and it costs one line:

```js
typeof chrome?.storage?.local     // 'object' — good; 'undefined' means the manifest lost "storage"
chrome.runtime.id                 // a non-empty string on an extension page; undefined means you are not on one
```

**`chrome.runtime` present while `chrome.storage` is absent means a missing permission, not
a missing extension context.** That distinction cost a round here: `chrome_url_overrides`
always serves the new tab from the extension origin, so the page cannot silently load as a
web page. The page now also checks both before it does any work and says which one is wrong.

## Checking the interface

The extension has never been run in CI, so this is a manual pass. Work down it.

**This costs money.** Every prompt is a billable OpenRouter call, and step 5 is five of
them. Point the model at something cheap before you start.

**Step 1 has been driven; steps 2–12 have not, and the reason is money.** The unpacked
extension has been loaded into Chromium and exercised with a placeholder key, which is
enough to prove the gate, the database, the rendering and every control — but not enough to
make a billable call. Everything from **Send something** onward needs a real key and has
never been run by anyone. Expect to find things that are not in here.

1. **Load unpacked.** Open a new tab. A modal blocks the app asking for an OpenRouter
   key — nothing else is usable until you provide one.
   **If that modal does not appear, stop here.** The page reports the reason under the
   Send button, and it names which fault it is: a missing `storage` permission, or a page
   that is not running as an extension. *Check the page has its permissions* above settles
   it in one line. Both faults were real here, and each cost a round to find.
   **If boot gets past the gate and then fails, the message names the step** —
   `Startup failed at 4 · history: …`. Read that number: it is the step in `boot()` that
   threw, and each one is numbered in the file's own header comment. A message with no
   step number means the API-key gate was cancelled, which is your own doing and not a
   fault.
   **Open DevTools first and watch the console.** An
   `Applying inline style violates the following Content Security Policy directive`
   error means a `style="…" attribute has crept back into the markup — `manifest.json`
   sets `"style-src 'self'"`, which forbids them, and the styles it should have applied
   will be missing. Search the tree for `style="`; a class belongs in a stylesheet.
   With the console clean, the three panes should fill the tab, each with its glass
   surface and its own scrollbar. In the right pane, **Your prompt** should sit just
   above the textarea — close, but not touching it, and spaced like the **Model** label
   above its own control — the textarea should take the height left over by the controls
   above it, and the **Send / Clear** footer should never be overlapped. Resize the
   window to check it, including narrower than the design width.

   > **A pane that looks right is not proof that anything works.** This interface is
   > static HTML and CSS, so it renders identically whether or not any JavaScript runs.
   > It once sat exactly like this with `boot()` defined and never called — no gate, no
   > database, no listener on any control — and then again with a manifest that declared no
   > `permissions` at all, where every storage call threw, and then again with a
   > `renderHistory()` that threw before writing a single row, which stopped `boot()`
   > before step 5, where every listener is attached. Three different causes, one
   > identical-looking page. The checks that prove the app is alive are the ones after
   > this: a chat in the history list, and a **Send** button that disables itself.
2. **Send something.** Type a short prompt, press **Send**. The chat is titled from the
   first line, your prompt appears in the **centre** pane on the **right**, and then **the
   answer should start arriving word by word** on the left with a blinking caret. The
   button says *Waiting…* and is disabled until it finishes.
   **Above the conversation, one status line updates in place** — `Working…`, then
   `Writing…` as the first token lands, then `Answer ready`. It is a single row: it changes
   its text and never grows a line, so there is no log to scroll and nothing to read back.
   If nothing arrives after a few seconds, open DevTools — the worker logs the reason, and
   the status line says *Failed*.
3. **The answer is saved.** Reload the page. The prompt and the full answer are both still
   there.
4. **Change the model.** Pick the second entry in the dropdown; the hint under it should
   change to that id. Type `anthropic/claude-sonnet-5` in the custom box; the hint should
   say the custom id overrides the dropdown. Clear it and the dropdown takes over again.
   Send, and confirm the answer changes.
5. **Turn multi-agent on.** The pill goes from red **OFF** to green **ON**, and the max
   agents field becomes editable. Clear it and press Tab — it should snap to `1`, not stay
   empty. Set it to 3 and send again.
6. **Watch the status line.** With multi-agent on, the count in the status row rises to
   four — the Main Agent plus three sub-agents — reads `Working… · 4 running`, and **falls
   to zero as each one finishes**. It is one row, not a list: agents do not appear as
   entries and there is no per-agent log to scroll. **Sub-agent answers are not shown at
   all** — the transcript holds the main agent's answer and nothing else.
7. **Rename the chat.** Edit the title field; "Saved" flashes and the history list updates.
8. **New chat, then switch between them.** Chats persist across a reload.
9. **Drop a file on the dropzone.** It is listed. It is *not* attached to anything yet.
10. **Make it look something up.** Ask a question a stored answer does not cover —
    "what is the latest stable version of X" or "find me an article about Y". The status
    line should read **Searching…** and then **Reading…** while it works, and the answer
    should come back **naming where it got the facts**. Partial JSON in the
    transcript or a raw tool argument as visible text means the streaming assembly is
    broken.
11. **Watch it rename the chat.** In the same answer, the title should change by itself,
    once, to something that names the subject rather than repeating your question. The
    history list should update to match.
12. **Replace the key.** Open **Settings**. The field is `readonly` and shows a masked
    value — **`sk-or-v1-••••…`, never the real key** — with an **Edit** button beside it
    and **Update key** greyed out. Press **Edit**: the field empties, becomes editable, and
    Update key turns on. Now press **Cancel** and reopen Settings — the mask is back, and
    your old key still works, because Cancel writes nothing. Press **Edit**, paste a new
    key, press **Update key**, and send something: the new key is the one being used.
    *If the mask ever shows something other than dots, or if Cancel changed your key, stop
    and say so — that is a credential leak and it is the one thing on this page that is not
    a cosmetic fault.*
13. **Read the system instructions.** Open DevTools on the new-tab page:
    ```js
    const { get } = await import('./lib/instructions.js');
    (await get()).slice(0, 80);   // the Main Agent's operating manual
    ```
    It should return the bundled text from `src/prompts/system-instructions.md`. Reload,
    run it again — the same text, this time read from IndexedDB rather than the bundle.

### If a send fails

The reason appears under the Send button, and the status line above the conversation says
*Failed*. The common ones:

| Message | What it means |
|---|---|
| `OpenRouter returned 401` | The key is wrong, revoked, or expired. Replace it in Settings. |
| `OpenRouter returned 402` | No credit left on the account. |
| `OpenRouter returned 400` with a model error | The model id is wrong. Type a different one in the custom box. |
| `No OpenRouter key is stored` | Should be impossible — the modal blocks first. Reopen Settings and save the key again. |
| `The background worker went away` | The service worker was terminated mid-request. Send again. |
| `Stopped after 6 rounds of tool calls without an answer` | The model kept asking for tools instead of answering. Rephrase, or drop the custom model box for a known preset. |
| `search_web failed: No results for "…"` | DuckDuckGo rate-limited, or its page structure changed. The latter is `parseSearchResults` in `src/tools.js`. |
| `Only https URLs can be read` | A tool was pointed at a local file or a plain-http link. Expected — the model has to follow a search result instead. |
| `Could not check where <host> points` | The DNS-over-HTTPS lookup failed or returned nothing, so the page was not read. The guard fails closed on purpose; retry, and check for a network that blocks `cloudflare-dns.com`. |
| `… resolves to 169.254.169.254, which is a link-local address` | The guard caught a page trying to steer the agent at cloud credentials. This is the guard working. |

## Verifying the database layer

With the new-tab page open, open the DevTools console and run:

```js
const db = await import('../db.js');   // db.js is one directory up, from src/ui/
const s = await db.createSession();
await db.addMessage(s.id, 'user', 'hello');
await db.listMessages(s.id);   // one row, message_index 0
await db.listSessions();       // contains s
await db.setTitle(s.id, 'Renamed');   // survives a reload
```

The negative paths should reject rather than silently corrupt:

```js
await db.addMessage('no-such-session', 'user', 'x');   // rejects
await db.saveInstruction('Bad_ID', 'x');               // rejects on the id rule
```

`await` at the top level needs the console in module-await mode, which DevTools has
enabled by default. If it complains, wrap the block in an async IIFE.

## Getting the API key

See [Environment](env.md).
---
name: repository-rules
description: Rules specific to the LXBrowser chat extension — the MV3 constraints, what may not be introduced, and where each kind of file belongs.
---

# Repository rules

Rules true **only** for this repository. Nothing here restates a shared rule — where one
applies, it lives in the shared set and is reached through the connector.

## Mode

This repository is **Mode B (consumer)**. The shared instruction set is resolved through
the **`lxagents-shared-instruction`** MCP connector; nothing from it is vendored, cloned,
or copied in. See `AGENTS.md` §Shared Instruction Set and
[`../index/root-index.md`](../index/root-index.md) for the override table — currently
empty, so the shared set is used unchanged.

## Stack

| Concern | Fixed by |
|---|---|
| Extension platform | Chrome **Manifest V3** |
| Markup and styling | HTML + CSS (Flexbox/Grid), no framework |
| Logic | JavaScript **ES6+ modules**, no bundler |
| Storage | **IndexedDB** — chat history and agent settings |
| Model access | **OpenRouter** API |
| Target surface | Full page, overriding the new tab |

## What may not be introduced

* **A build step or bundler in the shipped tree.** Modules load natively; adding a build
  invalidates "load unpacked" as the only install path. What ships is `manifest.json`,
  `src/`, and `src/ui/icons/` — nothing else, and nothing in it is produced by a command.
  A `package.json` confined to `tests/` is not a build step; see **Testing** below.
* **A framework or runtime dependency** — React, Vue, a CSS toolkit, a component library.
  The extension is dependency-free by design; see `.agents/design/principles.md`. This
  binds the shipped tree: Playwright is a development dependency of the harness, never a
  dependency of the extension, and `manifest.json` names no dependency because there is
  none to name.
* **A third documentation tree.** `wiki/` and `.agents/wiki/` are the only two. `docs/`,
  `documentation/`, and a second human wiki are all forbidden.
* **`INDEX.md`, anywhere.** Every index is a file in `.agents/index/`, never one placed
  inside the scope it indexes.
* **Shared-set content.** Any file readable from `agents://` must not exist here as a
  copy, unless it is a declared override in the root index.

## Where things live

| Kind of file | Path |
|---|---|
| Manifest | `manifest.json` — repository root, because Chrome loads it from there |
| Extension source | `src/` |
| Extension UI | `src/ui/` — `index.html` plus `css/` |
| Browser tests | `tests/e2e/` — the harness, its scripts, and the one `package.json` they need |
| Design system | `.agents/design/`, routed by `.agents/index/design-index.md` |
| Working plans | `.agents/plans/` — **untracked**, excluded by `.gitignore` |

## Constraints the platform imposes

* `manifest.json` cannot use JSON comments. Anything a reader needs to know about the
  manifest belongs in `wiki/` or `.agents/design/`, not in a comment.
* ES modules require the manifest to load pages with a real origin. The new-tab override
  qualifies; opening `index.html` from `file://` does not, so `file://` is not a valid
  test path.
* `chrome_url_overrides.newtab` replaces the new tab for every window. The three-pane
  layout is therefore the extension's only surface — there is no second page to link to.
* Chrome permissions are cumulative and user-visible. Add a permission only in the change
  that uses it; an unused permission is a review finding.
* An MV3 service worker is terminated when idle, and a single request is capped at roughly
  five minutes however active the port is. Anything long-running must assume it will be cut,
  and the page must treat a lost port as an expected event rather than a fault.
* **A URL the model supplies is untrusted input.** The manifest grants `https://*/*` so
  `read_page` can follow a search result to a host that cannot be known in advance, which
  makes "fetch anything the agent asks for" genuinely reachable. Any tool that fetches a
  model-supplied URL must, before the request: accept one scheme only and refuse the rest;
  resolve the hostname and refuse loopback, link-local, `.local`, and every private range —
  IPv4 and IPv6 alike; bound the download; and refuse a content type with no readable text.
  The check is on the resolved address, not on the hostname's text: a public name can point
  at `127.0.0.1`, and `localhost` alone is not the case worth defending.
  This is a guard, not a sandbox. It does not replace treating fetched content as data in
  the system prompt, and no guard here makes fetching model-supplied URLs safe — it makes
  them bounded.

## Testing

**There is a browser harness, and it lives in `tests/e2e/`.** It loads the unpacked
extension into a real Chromium and drives it. It exists because the static suite cannot
execute `app.js`, and that gap was not theoretical: a fully written and entirely
unreachable `boot()` passed every static check twice, a manifest with no `permissions` key
passed them again, and a helper that threw on its first element passed them a third time.
Each presented as unrelated dead controls in the browser and was invisible to 122 checks.

* **The extension root contains only what ships.** `package.json` and `node_modules/` live
  under `tests/e2e/`, never at the repository root, so the directory Chrome loads unpacked
  is byte-for-byte the shipped tree. `node_modules/` is gitignored.
* **`channel: 'chromium'`, not the default.** Playwright's default binary is
  `chrome-headless-shell`, which cannot load an extension at all. The wrong binary fails
  in a way that reads like a broken extension.
* **Stub OpenRouter with `context.route`, never by patching `fetch` in the worker.** A
  worker-side patch dies the moment Chrome recycles the worker, and a worker being
  recycled is what most of this suite is about. Routing is set on the browser context and
  survives it. `probe-route.mjs` pins that distinction.
* **Every check must be shown able to fail.** A suite that has only ever passed is not
  evidence. Run the new checks against a worktree of the pre-fix tree and confirm each one
  fails with its expected signature before the fix is called verified.
* **No billable call.** The harness seeds a placeholder key so `boot()` clears the gate.
  Every OpenRouter response is a scripted SSE body. Nothing here has ever spoken to
  OpenRouter, and a test that would is not a test to write.
* `node --check` and the structural checks in `static.mjs` remain worth running: they are
  fast, they fail without a browser, and `npm test` runs them first.

## Conventions the code follows

* **Promise-wrapped IndexedDB.** No raw `IDBRequest` handling in calling code — the
  wrapper in `src/db.js` returns promises and rejects with `Error`.
* **Foreign keys are enforced in the wrapper.** IndexedDB has no native `FOREIGN KEY`, so
  `chat_messages.session_id` is checked against `chat_sessions` in code, not by the store.
* **Overlays that cover page content are opaque.** Any surface that fully covers content —
  the agent-status dropdown, the API-key modal — uses a solid background and does not rely
  on `backdrop-filter` for legibility. See `.agents/design/overlay-opacity.md`.
* **The API key never enters the page.** `src/background.js` reads it from
  `chrome.storage.local` in the worker's own context and puts it in the `Authorization`
  header. It is never posted over the message port, never written to a file, never logged,
  and never included in an error message. This is why model calls live in the worker rather
  than in the page, and moving a call into the page would be a regression, not a
  simplification.
* **Every cross-boundary request settles exactly once.** Any request that crosses the port
  ends in one `done` or one `error` and never both, and never neither. The page's ability
  to remove an agent from the dropdown depends on that guarantee.
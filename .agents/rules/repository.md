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

* **A build step or bundler.** The repository has no `package.json` and no `node_modules`.
  Modules load natively; adding a build invalidates "load unpacked" as the only install
  path.
* **A framework or runtime dependency** — React, Vue, a CSS toolkit, a component library.
  The extension is dependency-free by design; see `.agents/design/principles.md`.
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

## Conventions the code follows

* **Promise-wrapped IndexedDB.** No raw `IDBRequest` handling in calling code — the
  wrapper in `src/db.js` returns promises and rejects with `Error`.
* **Foreign keys are enforced in the wrapper.** IndexedDB has no native `FOREIGN KEY`, so
  `chat_messages.session_id` is checked against `chat_sessions` in code, not by the store.
* **Overlays that cover page content are opaque.** Any surface that fully covers content —
  the agent-status dropdown, the API-key modal — uses a solid background and does not rely
  on `backdrop-filter` for legibility. See `.agents/design/overlay-opacity.md`.
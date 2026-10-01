# 0.1.0 — 2026-10-01

First release. This is a **shell**: the repository can be loaded in Chrome and the
interface renders, but nothing behind it is wired yet.

## Added

### Agent instruction architecture

* `AGENTS.md` — entry point and activation contract. Carries the `lxagents-shared-instruction`
  connector bootstrap verbatim, the auto-activation contract with all four permission
  gates inline, the shared instruction tools block stamped at set version `3.4.0`, the
  reading order, the routing protocol, the iron rule, the placement mandate, the
  discovery-protocol block, the version rule, and the no-session-links line.
* `.agents/index/` — six scope indexes: `root-index`, `agents-index`, `agent-wiki-index`,
  `project-wiki-index`, `memory-index`, `logs-index`.
* `.agents/rules/repository.md` — rules true only for this repository: the MV3 stack,
  what may not be introduced, and where each kind of file belongs.
* `.agents/wiki/context/repository-map.md` — orientation for an agent opening the
  repository cold.

### Documentation

* `README.md` — overview, quick start, and pointers into the wiki.
* `wiki/information/overview.md` — what the extension is and what works today.
* `wiki/environments/setup.md` — loading the extension unpacked, and the `db.js` console
  verification snippet.
* `wiki/environments/env.md` — the OpenRouter key, model identifiers, permissions, and the
  IndexedDB origin.

### Design system

* `.agents/design/` — Silver Glass scattered into thirteen single-subject files, from
  `principles.md` to `extension-adaptation.md`, routed by `.agents/index/design-index.md`.
* The router sits in `.agents/index/`, not inside the tree it routes — no index lives
  inside its own scope.

### Extension shell

* `manifest.json` — MV3, overriding the new tab, with a content security policy that
  forbids remote code. **No permissions and no service worker**: the extension loads and
  renders without them, and the search tool that needs them has not been written.
* `src/db.js` — three object stores behind a promise wrapper, so no calling code handles
  a raw `IDBRequest`. `message_index` is derived rather than accepted, and the
  `chat_messages.session_id` foreign key is enforced in code, because IndexedDB has no
  native constraint.
* `src/ui/index.html` — three floating, independently scrollable panes: conversation and
  history, agent status and logs, and the composer with file drop, multi-agent toggle, and
  the chat-title editor.
* `src/ui/css/tokens.css` — the design tokens copied verbatim, so neither the design system
  nor the extension can drift from the other.
* `src/ui/icons/icon-128.png` — generated icon.

### Core UI logic

* `src/ui/app.js` — the wiring: boot order, then listeners. It connects the modules and
  owns no state of its own.
* `src/ui/lib/storage.js` — `chrome.storage.local`, for the API key and UI settings.
  `sync` was rejected: it uploads to Google's servers, which is wrong for a credential.
* `src/ui/lib/agents.js` — the agent registry. `list()` returns only agents still running,
  so an agent leaving the dropdown is a property of the registry rather than a step the UI
  has to remember.
* `src/ui/lib/sessions.js` — the only module that touches the database.
* `src/ui/lib/views.js` — all DOM rendering.
* `src/ui/lib/api-key.js` — the blocking key gate.

No service worker. Nothing here is cross-origin, so there is nothing for one to do; it
arrives with the search tool, which is what brings `host_permissions`.

### Memory

* `.agents/memory/state/repository-state.md` — what exists, what does not, and the next
  obvious step.
* `.agents/memory/tasks/agents-setup.md` — record of this scaffold.
* `.agents/memory/tasks/extension-foundation.md` — record of the design-system scatter, the
  extension shell, and the core UI logic.

## Not in this release

**A working interface over no model.** Stated plainly so nobody mistakes it for the
product:

* **No OpenRouter client.** The key is stored and gated, but nothing calls the API, so a
  sent prompt is never answered.
* **No streaming, no synthesis.**
* **No real sub-agents.** `agents.simulate()` emits canned steps on a timer. It is the seam
  a real round-trip replaces.
* **No search tool**, no background fetcher, no HTML scraping.
* **No `background.js`.**
* **File attachments are listed, not read** — files appear in the dropzone but are never
  attached to a message.

## Unverified

**This extension has never been loaded in a browser.** It was authored in an environment
with no Chrome.

Verified: every module passes `node --check`; every import and every DOM id target
resolves; the agent registry was exercised directly under Node against the auto-remove
contract (21 checks — spawn, finish, idempotent re-finish, failure, log survival,
subscription and unsubscribe, and `simulate` reaching both completion and failure); limit
validation across 11 cases.

Not verified: the DOM path — `app.js` boot order, the modal, and the panes rendering.

The procedure is in [Setup](../../../../environments/setup.md).

## Notes

* `LICENSE` pre-existed this release and was already MIT © 2026 LXBrowser. It was not
  modified.
* A `.gitignore` excluding `.agents/plans/` was added during this work. It is **not yet
  committed** — see `.agents/memory/state/repository-state.md`.
* The design system at `.agents/design/` departs from the shared set's five-tree
  directory mandate, by explicit owner instruction. Recorded in `AGENTS.md` §Placement.
* The agent-status dropdown and the OpenRouter modal are opaque, not glass — they cover
  page content. See `.agents/design/overlay-opacity.md`.
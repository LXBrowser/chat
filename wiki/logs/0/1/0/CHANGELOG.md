# 0.1.0 — 2026-10-01

First release. The extension chats: prompts go to OpenRouter, answers stream back, and
both are stored. The search-and-read tool is not built.

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
* `wiki/environments/setup.md` — loading the extension unpacked, a manual interface
  checklist, and the `db.js` console verification snippet.
* `wiki/environments/env.md` — the OpenRouter key, model identifiers, permissions, and the
  IndexedDB origin.

### Design system

* `.agents/design/` — Silver Glass scattered into thirteen single-subject files, from
  `principles.md` to `extension-adaptation.md`, routed by `.agents/index/design-index.md`.
* The router sits in `.agents/index/`, not inside the tree it routes — no index lives
  inside its own scope.

### Extension shell

* `manifest.json` — MV3, overriding the new tab, with a content security policy that
  forbids remote code, a module service worker, and one host permission
  (`https://openrouter.ai/*`). No `activeTab`, no `tabs`, no `<all_urls>`.
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

### Model layer

* `src/background.js` — the service worker, and the only place an OpenRouter request is
  made. It reads the API key from storage in its own context and never posts it over the
  port, so the key cannot reach the page, the DOM, or an error message.
* Streaming over a long-lived port rather than `sendMessage`, which resolves once and
  cannot carry a stream. Requests are keyed by `requestId` because the main agent and every
  sub-agent are in flight at once.
* **Exactly one terminal message per request** — `delta` any number of times, then one of
  `done` or `error`. That guarantee is what lets the page remove an agent from the dropdown.
* A port that disconnects aborts its own requests, and the client reconnects on the next
  send, so the worker being terminated when idle is invisible except to a request already
  in flight.
* `src/ui/lib/openrouter.js` — the page's port client.
* A **model picker** on the right pane: a dropdown of `openai/gpt-4o-mini` and
  `deepseek/deepseek-v4-flash`, plus a custom-id field that overrides the dropdown.
  Stored in `chrome.storage.local`; default `openai/gpt-4o-mini`.
* **Send is guarded while a request is in flight.** A second click would stream two answers
  into the same transcript.

### Memory

* `.agents/memory/state/repository-state.md` — what exists, what does not, and the next
  obvious step.
* `.agents/memory/tasks/agents-setup.md` — record of this scaffold.
* `.agents/memory/tasks/extension-foundation.md` — record of the design-system scatter, the
  extension shell, and the core UI logic.

## Not in this release

* **No synthesis.** Sub-agents each make a real OpenRouter call and log their answer in the
  centre pane. Nothing merges them into a single response — an owner decision for this
  phase, to keep the token cost and the architecture manageable.
* **Sub-agent answers are not stored.** They stay in the agent log. `chat_messages` has no
  `subagent` role, and N extra answers per send would read as a bug in the transcript.
* **No search tool**, no HTML scraping. Neither agent has tools of any kind.
* **No cancel.** A request in flight can only be waited out.
* **No separate sub-agent models** — main and sub-agents share whichever model is selected.
* **File attachments are listed, not read** — files appear in the dropzone but are never
  attached to a message.

## Cost

Every prompt is a billable call, and multi-agent mode is one call for the main agent plus
one per sub-agent.

## Unverified

**This extension has never been loaded in a browser.** It was authored in an environment
with no Chrome.

Verified: every module passes `node --check`; every import and every DOM id target
resolves. 37 checks run under Node against stubbed `chrome` and `fetch` — 15 on the service
worker's SSE handling (frames split mid-JSON, role-only frames, unparseable frames,
`[DONE]`, exactly-one-terminal, HTTP error passthrough, abort on disconnect, and two
assertions that the key never appears in anything the worker posts), 11 on the model
settings, 11 on the port client. The agent registry was exercised directly against the
auto-remove contract — 21 checks.

Not verified: the DOM path and the real network round-trip — `app.js` boot order, the
modal, the panes rendering, the streaming caret, and whether OpenRouter accepts these
requests at all.

The procedure is in [Setup](../../../../environments/setup.md).

## Notes

* `LICENSE` pre-existed this release and was already MIT © 2026 LXBrowser. It was not
  modified.
* A `.gitignore` excluding `.agents/plans/` was added during this work and **is**
  committed, on its own.
* `deepseek/deepseek-v4-flash` is in the model picker exactly as supplied and has not been
  verified against OpenRouter's catalogue. A wrong id fails loudly at request time.
* The design system at `.agents/design/` departs from the shared set's five-tree
  directory mandate, by explicit owner instruction. Recorded in `AGENTS.md` §Placement.
* The agent-status dropdown and the OpenRouter modal are opaque, not glass — they cover
  page content. See `.agents/design/overlay-opacity.md`.
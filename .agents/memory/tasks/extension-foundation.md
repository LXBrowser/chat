---
name: memory-tasks-extension-foundation
description: Record of the design-system scatter and the MV3 extension build — the task table plus a per-task entry appended as each branch lands.
---

# Task — extension foundation

Goal: scatter `DESIGN.md` into a routed tree, then build the static MV3 extension shell.

Objective: a repository in which the design system is navigable one subject per file, and
a Chrome extension that loads unpacked and renders three working panes against a real
database layer.

Detail: static only — no `app.js`, no `background.js`, no agent orchestration. Logic
follows after the layout is signed off. Silver Glass governs the extension UI. Branches
stack and are pushed; no pull request without an explicit yes.

| # | Title | Scope (one line) | Repository | Branch | Files / areas | PR |
|---|---|---|---|---|---|---|
| 1 | Plan record | This file, written before the work | LXBrowser/chat | `docs/agents-setup` | `.agents/memory/tasks/` | #1 |
| 2 | Design system | Scatter `DESIGN.md` one subject per file | LXBrowser/chat | `docs/design-system` | `.agents/design/`, `.agents/index/` | #2 |
| 3 | Extension shell | Manifest, database layer, three-pane UI | LXBrowser/chat | `feat/chat-extension` | `manifest.json`, `src/` | #3 |
| 4 | Core UI logic | API-key gate, multi-agent toggle, agent dropdown, history | LXBrowser/chat | `feat/chat-logic` | `src/ui/app.js`, `src/ui/lib/` | #4 |
| 5 | Model layer | Service worker, streamed OpenRouter calls, real sub-agents | LXBrowser/chat | `feat/openrouter-integration` | `src/background.js`, `src/ui/lib/openrouter.js` | #5 |
| 6 | Tools and search | Tool-calling loop, `search_web` / `read_page` / `update_chat_title`, seeded system instructions | LXBrowser/chat | `feat/tools-and-search` | `src/tools.js`, `src/prompts/`, `src/background.js`, `src/ui/lib/` | #6 |

The stack is a chain: task *k* branches from task *k-1*'s branch, and its pull request
targets that branch rather than `master`, so each request shows only its own diff. The
chain merges bottom-up — #6 into #5, #5 into #4, and so on — and **no task merges on its
own**. Every step waits for the owner.

The `PR` column was left empty while the branches were being pushed, and filled once all
six were open.

### Task 1 — `docs/agents-setup`

The plan record, written before any of tasks 2–3 begin so a reviewer can check the plan
against the work rather than infer it from the diff.

Written. The record and this entry are seeded on the setup branch, because `.agents/`
did not exist until that branch landed and a record needs somewhere to live. The setup
itself is recorded separately in
[`agents-setup.md`](agents-setup.md).

**What the next tasks now depend on.** Task 2 must add its router to `root-index.md` and
to the `AGENTS.md` local rows **in the same commit** as the tree — the setup deliberately
did not include them, so no commit in between carries a broken link. Task 3 must match
the storage contract described here or the database verification in `wiki/environments/setup.md`
will not hold.

### Task 2 — `docs/design-system`

Scattered `DESIGN.md` into `.agents/design/`, one subject per file.

**Landed.** Thirteen files: `principles`, `tokens-palette`, `tokens-glass`,
`tokens-geometry`, `glass-surface-recipe`, `overlay-opacity`, `components`,
`layout-chrome`, `runtime-includes`, `css-organization`, `reusability`, `accessibility`,
`extension-adaptation`. Every section of `DESIGN.md` maps to exactly one of them.

`extension-adaptation.md` is new — `DESIGN.md` described a system for static
documentation sites and said nothing about a product UI. It records what carries over
unchanged, what the extension changes, and — most usefully — that
`overlay-opacity.md` is binding on two specific surfaces.

**Router placement.** `design-index.md` went to `.agents/index/`, not to
`.agents/design/`. The directory mandate forbids an index inside its own scope, and that
applies to a tree the mandate does not sanction either. The design tree is the exception to
the *tree list*, not to the *index placement* rule.

**Added in the same commit,** so no commit in the stack carries a broken link: the
`design-index.md` row in `root-index.md`, the local row in `AGENTS.md`, and the pointer in
`README.md`.

**What the next task now depends on.** Task 3 copies `tokens-palette`,
`tokens-glass`, and `tokens-geometry` into `src/ui/css/tokens.css` **verbatim** — same
names, same values, no renaming. The agent-status dropdown and the OpenRouter modal must
be opaque, per `overlay-opacity.md`. Anything else task 3 styles should be a component from
`components.md` rather than new CSS.

### Task 3 — `feat/chat-extension`

The static extension shell.

**Landed.**

* `manifest.json` — MV3, `chrome_url_overrides.newtab` → `src/ui/index.html`, a
  `content_security_policy` forbidding remote code, and a generated 128px icon.
* `src/db.js` — three object stores, every request promise-wrapped.
* `src/ui/index.html` — three floating, independently scrollable panes.
* `src/ui/css/{tokens,layout,components}.css`.

**No permissions, and no service worker.** Both are deliberate. The extension loads and
renders without them; `host_permissions` arrive with the background fetcher, which is the
first thing that needs them.

**No `app.js`.** The `<script>` tag is absent and the page references it in a comment,
rather than shipping a 404 in the console. Every control is inert by design.

**Tokens copied verbatim**, per the rule task 2 set. `src/ui/css/tokens.css` renames
nothing and changes no value — the design system and the extension cannot drift because
neither is allowed to edit the other's copy.

**Two decisions worth knowing.**

`db.js` derives `message_index` from the current count rather than accepting it from the
caller, so a message cannot be written with a gap or a duplicate. And the
`chat_messages.session_id` → `chat_sessions.id` foreign key is checked in `withTx` before
the insert, because IndexedDB has no native constraint.

**Verified:** `db.js` parses clean under `node --check`; the manifest parses as JSON; every
stylesheet the page references exists. **Not verified — no Chrome in this Codespace:** the
page rendering, and the `db.js` runtime round-trip. That check is written up in
`wiki/environments/setup.md` for the owner to run.

**What the next task now depends on.** `index.html` ends with a comment marking exactly
where `<script type="module" src="app.js">` goes. The logic pass adds it there, and
`app.js` imports `db.js` as `../db.js` — one directory up, which is also what the console
verification snippet in `wiki/environments/setup.md` uses. The manifest needs
`host_permissions` and a `background` service worker when the fetcher lands, and the
`chrome.storage.local` key store when the modal is wired.
### Task 4 — `feat/chat-logic`

Brought the three panes to life. Owner-scoped to four features: the OpenRouter modal, the
multi-agent toggle, the agent dropdown with auto-remove, and loading history from the
database.

**Landed.** `src/ui/app.js` plus five modules under `src/ui/lib/` — `storage.js`,
`agents.js`, `sessions.js`, `views.js`, `api-key.js`.

**`background.js` deliberately not written.** The owner asked for one "if needed", and it
is not: nothing here is cross-origin or off-context, and an MV3 service worker is
terminated when idle, so it would be dead weight. It arrives with the search tool, which is
what actually needs `host_permissions`.

**`chrome.storage.local`, not `sync`.** The owner listed sync first; `sync` uploads its
contents to Google's servers, which is wrong for a credential, and
`wiki/environments/env.md` had already committed to `local`. Noted to the owner rather than
changed silently.

**How auto-remove is guaranteed.** `agents.list()` returns only agents still in the active
map. A finished agent is removed by `finish()`/`fail()` and the dropdown re-renders from
`list()`, so there is no UI-side removal step to forget. Logs outlive their agent so the
pane can still show what happened to the one being watched, and if the watched agent
finishes the selection falls back to another running agent rather than going blank.

**Three problems found and fixed during review, before commit.**

The history rows nested a delete control inside the select `<button>` — invalid HTML and
broken keyboard use. The rows are now containers holding two buttons.

Mutations called `refreshConversation()` directly *and* through a `sessions.onChange`
subscription, so two repaints could race and render stale data. The subscription is now
the only path.

The API-key modal attached its save handler with `{ once: true }`, so cancelling left that
handler attached and the next open fired it twice. Now torn down together with an
`AbortController`.

**Verified.** Every module passes `node --check`; every import and every `getElementById`
target resolves. The agent registry was exercised directly under Node against the
auto-remove contract — 21 checks covering spawn, finish, idempotent re-finish, failure,
log survival, subscription and unsubscribe, and `simulate` running to both completion and
failure. Limit validation: 11 cases covering clamping, truncation, and non-numeric input.

**Not verified.** The DOM path — `app.js` boot order, the modal, and the panes rendering —
cannot run without Chrome. See `wiki/environments/setup.md`.

The two test scripts were run from `/tmp` and **not committed**: the repository states it
has no test runner, and adding one was not in scope. They are the obvious first candidate
if that changes.

**What the next task now depends on.** `agents.simulate()` is the seam a real
OpenRouter round-trip replaces — swap its body for a fetch and the dropdown behaviour is
unchanged. `api-key.js` already stores to `chrome.storage.local` under
`openrouter_api_key`; the model client reads that same key. `views.renderTitle()` reads
through `sessions.getCurrent()`, so a rename shows without a reload.

### Task 5 — `feat/openrouter-integration`

The model layer. Task 4 left the interface working over no model; this makes the Main
Agent real and gives sub-agents real round-trips.

**Owner decisions taken before the work,** each of which changed the code:

* **Streaming, not one-shot** — SSE relayed to the page over a long-lived port, so the
  answer appears as it is generated.
* **Default model `openai/gpt-4o-mini`**, with a dropdown of two presets and a custom-id
  text field that overrides the dropdown.
* **Sub-agents real, no synthesis** — every spawned sub-agent makes its own OpenRouter
  call. Their answers are logged in the centre pane and deliberately *not* written to
  `chat_messages`: there is no `subagent` role in the schema, and N extra answers per send
  would read as a bug in the transcript.

**The key never enters the page.** `src/background.js` reads `openrouter_api_key` from
storage in the worker's own context and puts it in the `Authorization` header. It is never
posted over the port, so it cannot reach the DOM, a devtools dump, or an error message.
This is the actual reason the service worker exists — it was not written earlier because
nothing was cross-origin until now.

**Why a port and not `sendMessage`.** `sendMessage` resolves once, at the end; it cannot
carry a stream. Requests are keyed by `requestId` because the Main Agent and every
sub-agent are in flight simultaneously.

**The one-terminal-message rule.** `delta` may arrive any number of times, but exactly one
of `done` or `error` always arrives last. Without that, the page has no way to know when to
remove an agent from the dropdown, and the auto-remove contract from task 4 quietly breaks.

**Send is guarded while in flight.** A second click would stream two answers into the same
transcript. The lock is released in a `finally`, so a failure cannot leave the composer
disabled.

**`host_permissions: ["https://openrouter.ai/*"]`** — the first permission in the manifest,
and the smallest thing the model layer needs. No `activeTab`, no `tabs`, no `<all_urls>`.

**Two bugs found by the tests, both before commit.**

`MODEL_PRESETS` was declared *after* `DEFAULT_SETTINGS`, which reads it. That is a temporal
dead zone error on load — the extension would have thrown on every page open, and nothing
short of running it would have said so.

The error note under the send button was repainted away by the `finally` that clears the
busy state, so a failure message would have been visible for zero frames. The note is now
held outside the request.

Also fixed: an empty model answer was checked *after* `agents.finish()`, which would have
found the agent already out of the active list and logged nothing.

**Verified.** 37 checks across three scripts run under Node against stubbed `chrome` and
`fetch`: 15 on the service worker's SSE handling (mid-JSON frame splits, role-only frames,
unparseable frames, `[DONE]`, exactly-one-terminal, error status passthrough, abort on
disconnect, and two assertions that the key never appears in anything the worker posts);
11 on the model settings (preset defaults, custom override, whitespace handling, malformed
stored values); 11 on the port client (delta accumulation, request demultiplexing, reconnect
after disconnect, dead-port rejection). Every module passes `node --check`; every import and
`getElementById` target resolves.

**Not verified.** The streaming DOM path — caret, live append, scroll-follow — and the real
OpenRouter round-trip. No Chrome in this environment. The check is written up in
`wiki/environments/setup.md`.

As before, the scripts were run from `/tmp` and **not committed**; the repository has no
test runner and adding one was not in scope.

**Known limits carried forward.** Chrome caps a single request at roughly five minutes, so
a very long answer is cut mid-stream and arrives as an error rather than a completion. The
worker is terminated when idle, and a termination mid-stream loses that request — the port
reconnects on the next send.

**What the next task now depends on.** `agents.spawn`/`finish`/`fail` and the port protocol
are the two seams the search tool extends: the search tool is another `type: 'chat'`
variant from the page and another branch in the worker, not a new mechanism. The Main
Agent's system prompt is the place a tool-use instruction goes.

### Task 6 — `feat/tools-and-search`

Tool calling, the built-in search-and-read tools, a tool that writes to the interface, and
a system prompt that tells the Main Agent it has them.

**Owner decisions taken before the work,** each of which changed the code:

* **DuckDuckGo's HTML endpoint** for `search_web`. Keyless, so no third-party search account
  is required — which is also why the extension parses someone else's markup with no API
  contract behind it.
* **`https://*/*` in `host_permissions`**, because `read_page` follows search results to
  hosts that cannot be enumerated in advance.
* **A bundled seed file, not the repository's `AGENTS.md`.** The extension cannot read a
  file in this repository at runtime, so `src/prompts/system-instructions.md` ships with
  the extension and seeds `agent_instructions` on first run.

**The tool loop lives in the worker.** A tool round needs a second request, so the loop
went where the requests already are; the page sends schemas and waits. It is bounded at six
rounds and then says so, because the alternative is hanging until Chrome's five-minute cap
kills the request with no explanation.

**Tools are split by where they can run.** `search_web` and `read_page` execute in the
worker, which already owns every cross-origin fetch. `update_chat_title` executes in the
page — the worker has no `currentId` and no interface, so there is nothing there for it to
rename. The worker forwards it as a `tool_request` over the same port and waits.

**A tool failure is a result, not a crash.** Both paths convert an error into a `tool`
message the model can route around. A page tool failing was originally treated differently
from a network tool failing, which meant whether *renaming the chat* worked decided whether
the agent could answer at all. That was a design flaw, not a bug: `askPageSafely()` now
matches `runNetworkToolSafely()`, and the reasoning is in a comment so it does not get
undone.

**Streamed tool calls are reassembled by `index`,** and nothing is assigned on sight — the
id arrives in the first fragment and the arguments are split wherever they fall. Only prose
deltas reach the transcript; tool-call fragments are JSON arriving a few characters at a
time and would fill the answer with a broken argument string.

**`read_page` is guarded,** because a tool that fetches whatever the model names is the
prompt-injection shape: https only, `localhost` and the private ranges refused, downloads
capped at 5 MB by content-length, and non-text content types refused. These are guards, not
a sandbox, and the seed prompt tells the Main Agent to treat page content as data.

**`search_web` distinguishes empty from broken.** "No results" and "the parser broke" look
identical from outside the extension, and only one of them is the model's fault to work
around, so they are different messages.

**Sub-agents get no tools.** Each answers one focused turn; giving it a search tool would
add a second billable round per sub-agent for a task with no transcript to justify it.

**Seven bugs found by the tests, all before commit.** A temporal dead zone in
`storage.js` that would have thrown on every page load. `match.index` destructured off the
match array instead of the match object, so every search entry landed at position 0 and
snippet pairing broke silently. A `*/` inside a block comment that closed the comment and
made `src/tools.js` a syntax error. An unclosed `<script>` whose source leaked into
extracted text. Snippets paired by index rather than by document position, which shifts
every snippet up one when a single result has no snippet. `decodeEntities` never matching
`#`, so `&#65;` stayed as written. And `requestPageTool` reading `call.function.arguments`
after its caller had been changed to pass a flat shape.

**Verified.** 105 checks across five scripts under Node against stubbed `chrome` and
`fetch`: 26 on the service worker (SSE handling, the tool loop, multi-call rounds, the loop
bound, page-tool round-trips, and assertions that the key never appears in anything the
worker posts), 11 on the model settings, 11 on the port client, 28 on the tools (search
parsing, HTML-to-text, entity decoding, and both network tools against a stubbed fetch), 8
on the page half of a tool round-trip, and 21 on the agent registry. Every module passes
`node --check`; every import and DOM id resolves.

**Not verified.** The DOM path, the real OpenRouter round-trip including whether it accepts
these tool schemas, and whether DuckDuckGo still serves markup `parseSearchResults`
recognises. The tool loop has only been driven by scripted SSE bodies. No Chrome in this
environment; the check is written up in `wiki/environments/setup.md`.

As before, the scripts were run from `/tmp` and **not committed**; the repository has no
test runner and adding one was not in scope.

**What the next task now depends on.** `update_chat_title` is the pattern any future tool
that touches the interface follows: declare the schema in `src/tools.js`, implement it in
`src/ui/lib/page-tools.js`, and it arrives at the worker through `pageToolNames()` without
any change to `background.js`. The seeded instructions can be edited in `agent_instructions`
and nothing in the UI writes them yet — that is the seam an instructions editor uses.

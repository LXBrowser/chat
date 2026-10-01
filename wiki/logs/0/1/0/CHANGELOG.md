# 0.1.0 — 2026-10-01

First release. The extension chats: prompts go to OpenRouter, answers stream back, and both
are stored. The main agent can search the web, read what it finds, and rename the chat.

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
  forbids remote code, a module service worker, and host permissions for OpenRouter,
  DuckDuckGo, a DNS resolver, and `https://*/*`. No API permissions: no `activeTab`, no
  `tabs`, no `scripting`.
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

### Tool calling

* **The tool loop lives in the service worker**, not the page. A tool round needs a second
  request, and holding the loop in one place is what bounds it — six rounds, then it gives
  up with an explanation rather than hanging until Chrome's five-minute cap kills it.
* Streamed `tool_calls` fragments are reassembled by `index`. The id arrives in the first
  fragment and the arguments are split wherever they fall, so nothing can be assigned on
  sight; a name that arrives in two pieces is appended, not overwritten.
* **Tool-call fragments are never shown as transcript text.** They are JSON arriving a few
  characters at a time, and only prose deltas go to the page.
* The assistant turn is echoed back verbatim, `tool_calls` included, before the `tool`
  messages — without it the API rejects the follow-up as answering no call.
* **A tool failure is a result, not a crash.** Network tools and page tools both convert an
  error into a `tool` message the model can route around. The two paths behave the same way
  deliberately: if only one of them ended the conversation, whether renaming the chat worked
  would decide whether the agent could answer at all.
* Sub-agents are given **no tools**. A search tool costs a second API round, and a
  sub-agent has no transcript to justify it.

### Built-in tools

* `src/tools.js` — the schemas the model is told about, and the network tools the worker
  runs. Split by where a tool can actually run: `search_web` and `read_page` execute in
  the worker, which already owns every cross-origin fetch; `update_chat_title` executes in
  the page, which is the only context with a `currentId` and an interface.
* `src/ui/lib/page-tools.js` — the page half of that split.
* **`search_web`** queries DuckDuckGo's HTML endpoint, which needs no API key, and returns
  titles, links, and snippets as JSON. An empty result is reported distinctly from a parse
  failure, because from the model's side the two look identical and only one is worth
  retrying differently.
* **`read_page`** fetches a URL and returns readable text — markup, scripts, styles, and
  comments removed, entities decoded in a single pass. Long pages are truncated; a page with
  no readable text is an error rather than an empty answer.
* **`read_page` is guarded**, because a tool that fetches whatever the model names is the
  prompt-injection shape. At every hop, including every redirect hop: https only; the
  hostname **resolved and every returned address checked**, refusing loopback, private,
  link-local and reserved IPv4, `169.254.0.0/16` where cloud metadata lives, and any IPv6
  outside `2000::/3` — including `::ffff:127.0.0.1` and the other ways an IPv4 address is
  dressed as IPv6; bare and `.local` / `.internal` names refused outright; **fails closed**
  if the resolver is unreachable; downloads capped at 5 MB by content-length; non-text
  content types refused. Resolution is over DNS-over-HTTPS because the guard trusts the
  answer and a plain lookup can be forged in transit. These are guards, not a sandbox — the
  instruction file tells the main agent to treat page content as data.
* **`update_chat_title`** renames the current session in `chat_sessions` and repaints the
  title and the history list. The instruction file tells the model to use it once, with a
  title that names the subject rather than repeating the question.

### System instructions

* `src/prompts/system-instructions.md` — the main agent's operating manual: the tools it
  has, that it should look things up rather than claim them from memory, that it should say
  when it looked, and what it cannot do. It ships with the extension; this repository's own
  `AGENTS.md` is not packaged and cannot be read at runtime.
* `src/ui/lib/instructions.js` — seeds the `agent_instructions` store on first run and reads
  it thereafter, so the text can be edited locally without shipping a new bundle. If the
  seed file cannot be read it falls back to a short string rather than failing to boot.
* Only the main agent gets the instructions or the tools. A sub-agent is handed one focused
  task as a single turn, so a delegated answer does not also cost a search.

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
* **No search for sub-agents.** Tools are declared only for the main agent's requests.
* **The search parser reads third-party HTML.** DuckDuckGo's keyless endpoint was chosen so
  no search API key is needed, which means there is no contract behind the markup. It is
  the most likely thing in this release to break silently; it fails with a message that
  distinguishes an empty result from a parse failure.
* **No cancel.** A request in flight can only be waited out.
* **No separate sub-agent models** — main and sub-agents share whichever model is selected.
* **The system instructions are not editable in the interface.** They are seeded into
  `agent_instructions` and read from there, but nothing in the UI writes them yet.
* **No way to forget a stored API key** other than replacing it. Removing it needs an
  explicit control, not a side effect of cancelling.
* **File attachments are listed, not read** — files appear in the dropzone but are never
  attached to a message.

## Cost

Every prompt is a billable call, and multi-agent mode is one call for the main agent plus
one per sub-agent. A prompt that uses tools is several calls for the main agent alone — one
per round.

## Unverified

**This extension has never been loaded in a browser.** It was authored in an environment
with no Chrome.

Verified: every module passes `node --check`; every import and every DOM id target
resolves. 102 checks run under Node against stubbed `chrome` and `fetch` — 26 on the
service worker (SSE handling, the tool loop, and assertions that the key never appears in
anything the worker posts), 11 on the model settings, 11 on the port client, 46 on the
tools (search parsing, HTML-to-text, entity decoding, the SSRF guard including rebinding
across a redirect, and both network tools against a stubbed fetch), 8 on the page side of
a tool round-trip, and 21 on the agent registry against the auto-remove contract.

Not verified: the DOM path and the real network round-trip — `app.js` boot order, the
modal, the panes rendering, the streaming caret, whether OpenRouter accepts these requests
or the tool schemas at all, whether the DuckDuckGo endpoint still serves markup this
parser recognises, and whether Chrome returns a readable `Location` for a
`redirect: 'manual'` response as the redirect guard assumes. The tool loop has been driven
only by scripted SSE bodies.

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
* `https://*/*` is granted so `read_page` can follow a search result to an arbitrary host.
  Chrome warns about it at install time. It is deliberate, and the tool's own guards are in
  `src/tools.js` — see [Environment](../../../../environments/env.md).
* **The `read_page` guard resolves DNS over HTTPS** and therefore needs
  `https://cloudflare-dns.com/*`. It also fails closed: a network that blocks that
  resolver makes `read_page` stop working rather than start reading unchecked hosts.
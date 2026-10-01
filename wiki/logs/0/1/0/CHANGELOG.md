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
  forbids remote code, a module service worker, the `storage` permission, and host
  permissions for OpenRouter, DuckDuckGo, a DNS resolver, and `https://*/*`. No browsing
  permissions: no `activeTab`, no `tabs`, no `scripting`.
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

## Fixed

**Two defects the first browser run found.** Neither had been visible before, because the
extension had never been loaded.

* **The Content Security Policy was being violated.** `manifest.json` declares
  `"style-src 'self'"`, which is correct and stays. `src/ui/index.html` carried ten
  `style="…"` attributes, which that directive forbids outright, so Chrome refused to apply
  them. Every one is now a class in the stylesheets — `.eyebrow--flush`, `.hint`,
  `.push-top`, and `.pane__body--stack` — rather than ten one-off attributes.
* **The right pane overlapped its Send/Clear footer.** `.composer` carried `height: 100%`.
  Inside the flex column the pane body became, a percentage height resolves against the
  *container* and knows nothing about its siblings, so the composer claimed the body's
  entire height on top of the controls stacked above it and overflowed by their combined
  height. `.composer__input`'s `min-height: 120px` meant it could not give the space back.
  The composer now takes `flex: 1 1 200px` with a floor on the container rather than on the
  input: it absorbs the pane's slack, it stops short of the footer, and below the floor the
  pane body scrolls instead of the composer collapsing.
* **The composer textarea fills its container and scrolls internally** (`overflow-y: auto`,
  `resize: none`).
* **The multi-agent toggle's colour moved out of JavaScript.** `renderMultiAgent` assigned
  `btn.style.color` and `dot.style.background` rather than toggling a class. That was never
  a violation — a CSSOM property assignment is not the `style` attribute, and the policy
  forbids only the attribute — but the button already carries `aria-pressed`, the colour
  only *represents* that state, and a tint living in JavaScript can drift from the state it
  mirrors. It is now a stylesheet rule keyed off `aria-pressed`, and the redundant `data-on`
  mirror was dropped with it.

### The application had never run

**`boot()` was defined in `src/ui/app.js` and never invoked.** The file ended at its last
helper function with no call, so nothing in it had ever executed: no API-key gate, no
settings load, no database open, no chat history, and no listener on any control — Send,
Clear, New chat, Settings, the multi-agent toggle, the model picker, the dropzone and the
title bar were all inert.

This is worth reading twice, because the interface **looked completely normal**. It is
static HTML and CSS, which need no JavaScript to render, so three panes of glass, a working
layout and a clean console were all present on a page where not one line of behaviour
existed. The only reason it surfaced is that the API-key modal never appeared, and the
modal was the visible symptom of an invisible cause.

The prior verification passed and could not have caught it. Every import resolved, every
DOM id existed, and 102 Node checks were green — none of which execute `app.js`, and the
repository has no DOM harness that could. A new assertion now checks that no top-level
function in `app.js` is defined without being called; it fails on the file as it stood.

Fixed by invoking `boot()`, and by handling its one rejection: the gate rejects when the
user cancels, and because wiring happens after it the Settings button had no listener, so
cancelling would have been a dead end. The reason is now shown under the Send button and
Settings reloads to re-open the gate. Cancelling does not reload on its own — that takes
away the choice.

### Layout, second pass

The composer label sat with a zero gap against the textarea's border, which at 11px
uppercase with letter-spacing reads as collision rather than as alignment. It now has 4px
— the value `.eyebrow` already uses as its own bottom margin, so no new spacing value
enters the design system — and the hint below the textarea kept its 8px.

### The manifest declared no permissions

**`manifest.json` had no `permissions` key at all**, so every call through
`chrome.storage.local` threw `TypeError: Cannot read properties of undefined (reading
'local')`, and `boot()` rejected at step 1 — before the gate, the settings, the database or
any listener. That single missing line explains all three symptoms at once: the modal never
appeared, the model dropdown stayed empty, and Settings reloaded a page that was already
broken.

In Manifest V3 Chrome only injects `chrome.storage` into an extension's pages when
`"storage"` is declared. Undeclared, the namespace is `undefined` — there is no partial
version of it, and no warning at load time. **The service worker was dead for the same
reason**: `src/background.js` reads the key through that namespace in its own context, so
no OpenRouter request could ever have been made even with a key stored. Every "unverified"
caveat about the tool loop, the port and the streaming path sat behind this one line.

`"permissions": ["storage"]` is now declared, and it is the complete set — `src/` uses only
`chrome.storage` and `chrome.runtime`, and `chrome.runtime` needs no permission.

### The page now names the fault instead of showing a type error

The failure above was reported as a bare `TypeError` beside a Send button, with Settings
wired to reload — which is how a missing permission and a missing extension context were
confused for a round. **Both faults look identical from outside and they are not the same
problem**, so the page now checks before it does any work and says which one it is:
`startupFault()` distinguishes a page that is not running as an extension page from one
whose manifest lost the permission, and reports it in those words.

**A reload is no longer offered where it cannot help.** On a manifest fault the page
disables Send and says why, and deliberately does not wire Settings to reload — that was
the loop, clicking Settings to reload an already-broken context. The reload now exists only
on the path where re-running `boot()` re-opens a cancelled gate.

### The composer gap matches the rest of the pane

The label above the textarea moved from 4px to **6px**, matching `.model` — the only other
vertically-stacked flush eyebrow in the right pane. At 4px the composer was the tightest
flush label in the design, against the largest control in the pane. `.composer__hint`'s
rule is deleted rather than retuned: it carried a margin only to defend a gap the flex
column already provides, and at 6px it would have needed a 2px shim that breaks the next
time anyone edits the gap.

### The page could not build a single element

**`el()` in `src/ui/lib/views.js` could not write a dataset, and it threw on every call.**
The helper builds elements with `Object.assign(node, props)`, and three call sites pass
`dataset: { … }`. `Object.assign` performs `[[Set]]` on each key, and this is an ES module
and therefore strict mode. `HTMLElement.dataset` is declared
`[SameObject] readonly attribute DOMStringMap` — **it has no setter at all**:

```
TypeError: Cannot set property dataset of #<HTMLElement> which has only a getter
    at Object.assign (views.js:26)   <- el()
    at renderHistory (views.js:63)
```

`el()` now unpacks `dataset` into the map key by key, which is also what performs the
camelCase to `data-kebab-case` conversion, so `{ sessionId }` lands as `data-session-id`.
Every other prop still goes through `node[key] = value` on the same pass, and the attribute
**names are unchanged** — `app.js` selects on them, so renaming one would silently re-break
the handler it was written to serve.

**One fault, six symptoms, and nothing in the console said which control was involved.**
`renderHistory()` died on its first element, so `boot()` rejected at step 4, so **step 5 —
where every listener is attached — never ran**:

| Reported | Cause |
|---|---|
| Settings does nothing | step 5 never ran; the catch wired Settings to `location.reload()` |
| Multi-agent toggle inert | step 5 never ran |
| Dropzone and browse do nothing | step 5 never ran |
| Send and Clear broken | step 5 never ran |
| History empty and unclickable | `renderHistory()` threw before writing a single row |
| `dataset` getter error | the fault itself |

Two of the five reported items were not faults at all. The Model dropdown populates
correctly, because `renderModel` is step 2 and runs before the failure; an empty dropdown
was the key gate standing open with no key stored. And `index.html` has exactly one
`.model` container, one `#model-select`, 34 unique ids and no duplicates.

**This is the fault that only a real browser could find.** Three rounds of green checks
passed over it, because none of them executed `app.js` and the repository had no DOM
harness. See [Unverified](#unverified) for what running it changed.

### A boot failure now says which step failed

A rejection reached the owner as a bare `err.message` — "Cannot read properties of
undefined" — with no indication of which of the five steps produced it. That was the whole
of the evidence the fourth run had, and it is a large part of why the fault above took
three rounds to find: nothing on the page pointed at `renderHistory()`.

`boot()` now reports `Startup failed at 4 · history: <message>`. The order of `boot()` is
untouched — the gate still resolves first and the listeners are still wired last, because
gate-before-wiring is what makes a cancelled gate recoverable. **The gate is deliberately
not a numbered step**: cancelling the modal is a decision, not a fault, and labelling it
"step 1 failed" would report the owner's own choice back to them as a broken browser.

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

**The extension has now been executed end to end in a real browser, and that changes what
the rest of this section can say.** It has been loaded in Chrome four times. The first
reported the CSP violation and the right-pane overlap. The second, after that fix, found the
composer label on the textarea and the API-key modal never appearing — the modal because
`boot()` was never called, so the whole application was inert. The third was the first live
execution of anything in `app.js`, and it rejected at step 1 because the manifest declared
no permissions. The fourth reached step 4 and found the `dataset` fault above, which
stopped it before a single listener was attached.

**Those first three were read off a person looking at a screen.** This one was driven: the
unpacked extension is loaded into Chromium with Playwright, a placeholder key is written
into a throwaway profile so the gate opens, and the page is exercised. **19 checks, all
passing, no page errors**: boot completes, the gate closes, the model dropdown populates,
`data-session-id` is a real attribute, and every control answers — history rows switch
chats and delete, the title input follows the open chat, the multi-agent toggle flips
`aria-pressed`, Settings opens the modal and Cancel closes it, Clear empties the textarea,
Send enters its busy state, stores the prompt, reports the outcome and re-enables, and a
dropped file is listed. The composer measures a 6px gap with 6px of clearance to the
textarea's border.

**What that still does not cover is the request itself.** The harness has no key and no
intention of having one, so everything past `wireComposer()`'s call into the service worker
— the port, SSE streaming, the tool loop, sub-agent fan-out — remains unobserved against a
live OpenRouter. Send is verified to *respond* and to *report an outcome*, not to succeed.

Verified statically: every module passes `node --check`; every import and every DOM id
target resolves; no `style` attribute or style assignment anywhere in `src/`; all 47
classes used in `index.html` are defined in the stylesheets; `boot()` resolves to an
invocation with no top-level function left uncalled; and every `chrome.<api>` used in `src/`
has its permission declared or is one that needs none. **122 checks** run under Node
against stubbed `chrome` and `fetch` — 26 on the service worker (SSE handling, the tool
loop, and assertions that the key never appears in anything the worker posts), 11 on the
model settings, 11 on the port client, 46 on the tools (search parsing, HTML-to-text, entity
decoding, the SSRF guard including rebinding across a redirect, and both network tools
against a stubbed fetch), 8 on the page side of a tool round-trip, 21 on the agent registry
against the auto-remove contract, 3 on the manifest's permissions, 17 on the `data-*`
attribute names written by `views.js` and selected by `app.js`, and 11 on the boot step
labels agreeing with the file's own load-order list.

**The DOM gap is what four rounds of static checks could not close, and it is worth being
blunt about the cost.** A file with a fully written, correct, entirely unreachable `boot()`
passed every check twice. A manifest with no `permissions` key passed them again. A helper
that threw on its first element in a strict-mode module passed them a third time. **None of
them executed `app.js`, and the repository has no DOM harness to do so.** The uncalled-
function assertion, the permission sweep and the dataset sweep are one-shot checks against
faults already fixed — not standing guards, and not a substitute for running the thing.

**Two of the faults the harness first reported were the harness.** `sessions.current()`
returns an id rather than a record, and the history list is newest-first, so a test that
reads `current()?.title` and clicks the last row proves nothing about the product. That is
recorded because the instinct on a re-run is to go looking for a second real bug.

Not verified: **the request path.** Whether OpenRouter accepts these requests or these tool
schemas, whether the streaming caret behaves over a live stream, whether DuckDuckGo still
serves markup this parser recognises, and whether Chrome returns a readable `Location` for a
`redirect: 'manual'` response as the redirect guard assumes. The tool loop has been driven
only by scripted SSE bodies. Two layout cases are also still unobserved: the right pane
below its 140px composer floor, and the layout under 900px where the responsive rules give
`.pane` a `min-height: 260px`. Neither harness nor checks are committed — the repository
has no package manager, no build step and no runner.

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
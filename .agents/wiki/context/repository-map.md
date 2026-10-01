---
name: agent-wiki-context-repository-map
description: Orientation page — what lives where in the LXBrowser chat extension, its entry points, generated paths, and known gotchas.
---

# Repository map

What an agent needs before touching anything here.

## What this repository is

`@lxbrowser/chat` — a Multi-Agent Chat Chrome extension. Manifest V3, overriding the new
tab with a three-floating-pane interface. Vanilla HTML/CSS/ES6+ modules, no build step, no
dependencies. IndexedDB holds chat history and agent settings. Model access goes through
OpenRouter.

At version `0.1.0` the chat surface works end to end: prompts go to OpenRouter, answers
stream back, both are stored, and the Main Agent can search the web, read what it finds,
and rename the chat. Synthesis across sub-agents does not exist.

## Layout

```
AGENTS.md              Entry point + activation contract. Read first.
LICENSE                MIT, © 2026 LXBrowser
README.md              Overview only.
manifest.json          MV3 manifest. New tab → src/ui/index.html.
src/
  background.js        The service worker. Every OpenRouter call, the
                       tool loop, and the only place the API key is read.
  tools.js             Tool schemas, plus the network tools the worker runs.
  prompts/
    system-instructions.md   The Main Agent's operating manual. Bundled.
  db.js                IndexedDB wrapper. Three object stores, promisified.
  ui/
    index.html         The three panes, the key modal, the settings surface.
    app.js             Wiring only. Boot order, then listeners.
    lib/
      storage.js       chrome.storage.local. API key and UI settings.
      agents.js        The agent registry behind the status row. list()
                       returns only running agents — that is what makes
                       auto-remove total. No log: the row changes in place.
      sessions.js      The only module that touches the database.
      views.js         All DOM rendering. No state of its own. setActivity()
                       assigns textContent to the one status node.
      api-key.js       The blocking key gate.
      openrouter.js    Port client for the service worker.
                       Never sees the API key.
      instructions.js  Seeds and reads the Main Agent's system prompt.
      page-tools.js    Tools that need the page — update_chat_title.
    icons/             Extension icon, referenced from the manifest.
    css/
      tokens.css       Design tokens, lifted verbatim from the design system.
      layout.css       Three-pane floating grid, independent scroll.
      components.css   Shared components, plus the two opaque overlays.
.agents/               Local instruction set. Routed from index/root-index.md.
  index/               Six scope indexes. Nothing else lives here.
  rules/               Rules true only for this repository.
  design/              The Silver Glass design system, one subject per file.
  wiki/                Agent-facing knowledge.
  memory/              Dynamic state and per-task records. Ungated.
wiki/                  Human-facing documentation. No frontmatter.
  information/         Overview.
  environments/        Setup and environment handling.
  logs/0/1/0/          Released versions, newest first.
```

## Entry points

| What | Where |
|---|---|
| The running page | `src/ui/index.html`, reached only through the new-tab override |
| Model calls | `src/background.js` — the page cannot call OpenRouter at all |
| Tools | `src/tools.js` declares them; the worker runs the network ones, `src/ui/lib/page-tools.js` runs `update_chat_title` |
| System prompt | `src/prompts/system-instructions.md`, seeded into `agent_instructions` on first run |
| Database layer | `src/db.js` — every page imports it, nothing else opens a store |
| Manifest | `manifest.json` — Chrome loads this from the repository root |
| Instruction routing | `AGENTS.md` → `.agents/index/root-index.md` |

## Generated paths to leave alone

Nothing in this repository is generated. There is no build output directory, no lockfile,
and no vendored dependency tree. `manifest.json` and everything under `src/` are
hand-authored and committed.

`.agents/plans/` is **working scratch** and is never committed.

## Build, test, run

There is no build and no test runner. The extension is loaded unpacked and exercised in a
browser; see [`../../../wiki/environments/setup.md`](../../../wiki/environments/setup.md).

Database behaviour is verified by calling `src/db.js` directly from the new-tab console —
the snippet is in
[`../../memory/tasks/extension-foundation.md`](../../memory/tasks/extension-foundation.md).

## Known gotchas

* **A server added mid-session is not a working session.** MCP connectors load at session
  start. A connector registered after the session opened reports healthy and is still
  absent from the tool surface until the client restarts. This reads as a broken server
  rather than a stale session, and it is the most common cause of "the connector is not
  resolving".
* **`file://` will not load the extension.** ES modules and IndexedDB both require a real
  origin. Always load unpacked and use the new tab.
* **The `chat_messages.session_id` constraint is not in the schema.** IndexedDB has no
  foreign keys; the wrapper checks. Calling a store directly bypasses it.
* **The manifest grants `https://*/*`.** It is deliberate and it is broad — `read_page`
  follows search results to hosts that cannot be enumerated in advance. The guards are in
  the tool, not in the permission, and they resolve DNS over HTTPS — so
  `read_page` **fails closed** on a network that blocks `cloudflare-dns.com`.
* **Every redirect goes back through the `read_page` guard.** That is why the fetch uses
  `redirect: 'manual'`: a follow would let a public page point the request at a private
  address after the guard had said yes.
* **Tools are split by where they can run.** A tool that only fetches goes in
  `src/tools.js` and the worker runs it; a tool that touches the interface goes in
  `src/ui/lib/page-tools.js` and reaches the worker over the port. Adding one of either
  kind needs no change to `background.js`.
* **`parseSearchResults` reads third-party HTML with no API contract.** It is the most
  likely thing here to break silently. If search returns nothing, look there first.
* **The service worker is terminated when idle**, which is what closes the page's port.
  The client reconnects on the next request, so this is invisible except that a request
  already in flight is lost.
* **A single request is capped at about five minutes** by Chrome, however active the port
  is. A very long answer ends as an error rather than a completion.

## The shared set

Resolved through the **`lxagents-shared-instruction`** connector, not vendored. Every file
in that set is its own tool, named after its filename; `root_index` routes to the rest.
The tools this repository uses are declared in `AGENTS.md` §Shared instruction tools, at
set version `3.4.0`.
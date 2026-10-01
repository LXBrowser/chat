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

At version `0.1.0` it is a **shell**: the manifest, the database layer, and the UI layout
exist. Agent orchestration, the OpenRouter client, and the search tool do not.

## Layout

```
AGENTS.md              Entry point + activation contract. Read first.
LICENSE                MIT, © 2026 LXBrowser
README.md              Overview only.
manifest.json          MV3 manifest. New tab → src/ui/index.html.
src/
  db.js                IndexedDB wrapper. Three object stores, promisified.
  ui/
    index.html         The three panes, the key modal, the settings surface.
    css/
      tokens.css       Design tokens, lifted verbatim from the design system.
      layout.css       Three-pane floating grid, independent scroll.
      components.css   Shared components.
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
* **The manifest has no permissions yet.** That is deliberate for `0.1.0` — the background
  fetcher that needs `host_permissions` has not been written.

## The shared set

Resolved through the **`lxagents-shared-instruction`** connector, not vendored. Every file
in that set is its own tool, named after its filename; `root_index` routes to the rest.
The tools this repository uses are declared in `AGENTS.md` §Shared instruction tools, at
set version `3.4.0`.
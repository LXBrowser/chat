---
name: memory-state-repository-state
description: What the repository currently contains at 0.1.0 — the shell that exists, the orchestration that does not, and the next obvious step.
---

# Repository state

As of `0.1.0`, 2026-10-01.

## Mode

**Mode B (consumer).** The shared instruction set resolves through the
**`lxagents-shared-instruction`** MCP connector over HTTP at
`https://lxagents-mcp-shared-instruction.onrender.com/mcp`. Set version adopted: `3.4.0`.
Nothing from the set is vendored — there is no `git/`, `prompts/`, or `creators/` folder
here, and the override table in the root index is empty.

## What exists

* `LICENSE` — MIT, © 2026 LXBrowser (pre-existing).
* `AGENTS.md` — entry point, activation contract, shared instruction tools block.
* `.agents/index/` — six scope indexes.
* `.agents/rules/repository.md` — project rules.
* `.agents/design/` — the Silver Glass design system, scattered one subject per file.
* `.agents/wiki/context/repository-map.md` — orientation page.
* `.agents/memory/` — this file and the task records.
* `wiki/` — `information/overview.md`, `environments/setup.md`, `environments/env.md`.
* `manifest.json` — MV3, new-tab override, no permissions.
* `src/db.js` — IndexedDB wrapper, three object stores, promisified, FK enforced in code.
* `src/ui/index.html` + `src/ui/css/` — the three-pane interface and its styles.
* `wiki/logs/0/1/0/CHANGELOG.md` — the only release.

## Stack

Vanilla HTML, CSS, and ES6+ modules. No package manager, no build step, no dependencies.
Chrome Manifest V3, full-page new-tab override. IndexedDB for storage. OpenRouter for
models.

## What is not built

The entire agent runtime. Concretely:

* `app.js` and `background.js` do not exist.
* No OpenRouter client, no streaming, no key handling — the modal is markup only.
* No agent orchestration: no spawn, no monitor, no synthesis, no dropdown auto-remove.
* No search tool, no background fetcher, no HTML scraping.
* No file import, no drag-and-drop wiring.

Every control for these exists in the markup and does nothing. That is deliberate — the
layout was approved before the logic.

## Known open item

**`.gitignore` does not exist.** `plan_creator` requires `/.agents/plans/` to be
excluded, and forbids the agent from adding the rule. Until the owner adds it, the working
plan in `.agents/plans/` can be published by a `git add -A`. Stage explicit paths.

## Next obvious step

Wire the logic pass: OpenRouter client and key flow first, since the blocking modal gates
everything else. Then `app.js` for the three-pane interactions and the dropdown auto-remove,
then `background.js` and the search tool — which is what brings `host_permissions` with it.
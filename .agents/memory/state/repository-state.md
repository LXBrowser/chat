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
* `.agents/index/` — seven scope indexes.
* `.agents/rules/repository.md` — project rules.
* `.agents/design/` — the Silver Glass design system, thirteen single-subject files.
* `.agents/wiki/context/repository-map.md` — orientation page.
* `.agents/memory/` — this file and the task records.
* `wiki/` — `information/overview.md`, `environments/setup.md`, `environments/env.md`.
* `manifest.json` — MV3, new-tab override, no permissions, no service worker.
* `src/db.js` — IndexedDB wrapper, three object stores, promisified, FK enforced in code.
* `src/ui/index.html` + `src/ui/css/` — the three-pane interface and its styles.
* `src/ui/icons/icon-128.png` — generated icon.
* `wiki/logs/0/1/0/CHANGELOG.md` — the only release.

## Stack

Vanilla HTML, CSS, and ES6+ modules. No package manager, no build step, no dependencies.
Chrome Manifest V3, full-page new-tab override. IndexedDB for storage. OpenRouter for
models.

## What is not built

The entire agent runtime. Concretely:

* `app.js` and `background.js` do not exist, so **every control on the page is inert**.
* No OpenRouter client, no streaming, no key handling — the modal is markup only.
* No agent orchestration: no spawn, no monitor, no synthesis, no dropdown auto-remove.
* No search tool, no background fetcher, no HTML scraping.
* No file import, no drag-and-drop wiring.

That is deliberate — the layout was approved before the logic.

## What has not been verified

**The extension has never been loaded in a browser.** There is no Chrome in the authoring
environment. `db.js` was syntax-checked and the manifest was parsed, but the page has not
rendered and `db.js` has not been exercised at runtime.

The verification procedure is written up in `wiki/environments/setup.md` for the owner:
load unpacked, check the three panes render, then run the `db.js` round-trip and its two
negative paths from the new-tab console.

## Known open item

**`.gitignore` exists but is untracked.** The owner added it during this work, excluding
`.agents/plans/`, and `git check-ignore` confirms the working plan is now protected in this
checkout.

It has **not been committed**, so the exclusion does not travel with the repository — a
fresh clone has no rule and the working plan is one `git add -A` from being published. It
needs its own commit. The agent does not add it: `plan_creator` reserves `.gitignore` for
the owner.

Minor divergence from the shared convention: `plan_creator` specifies `/.agents/plans/`
with a leading slash; the file uses `.agents/plans/`. Functionally equivalent here, since
there is one such folder.

## Next obvious step

Wire the logic pass: OpenRouter client and key flow first, since the blocking modal gates
everything else. Then `app.js` for the three-pane interactions and the dropdown auto-remove,
then `background.js` and the search tool — which is what brings `host_permissions` with it.
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
* `src/ui/app.js` — the wiring. Five modules under `src/ui/lib/`.
* `src/ui/index.html` + `src/ui/css/` — the three-pane interface and its styles.
* `src/ui/icons/icon-128.png` — generated icon.
* `wiki/logs/0/1/0/CHANGELOG.md` — the only release.

## Stack

Vanilla HTML, CSS, and ES6+ modules. No package manager, no build step, no dependencies.
Chrome Manifest V3, full-page new-tab override. IndexedDB for storage. OpenRouter for
models.

## What is not built

The model layer. Concretely:

* **No OpenRouter client.** The key is stored and gated, but nothing calls the API.
* **No streaming, no synthesis.** A sent prompt is recorded as a user message and nothing
  answers it yet.
* **No real sub-agents.** `agents.simulate()` emits canned steps on a timer. It is the
  seam a real round-trip replaces.
* **No search tool**, no background fetcher, no HTML scraping.
* **No `background.js`** — nothing here is cross-origin, so there is nothing for a service
  worker to do yet. It arrives with the search tool, which brings `host_permissions`.
* **File attachments are listed, not read.** Files appear in the dropzone; their contents
  are never attached to a message.

## What works today

* Load unpacked; the API-key modal blocks until a key is stored.
* New chat, open chat, delete chat, rename chat — all against IndexedDB.
* Send a prompt; it is written to `chat_messages` and the transcript updates.
* Toggle multi-agent mode; the limit input enables and validates at ≥ 1.
* Send with multi-agent on; sub-agents appear in the centre dropdown, log as they work,
  and **leave the dropdown when they finish**.

## What has not been verified

**The extension has never been loaded in a browser.** There is no Chrome in the authoring
environment. Every module passes `node --check`, every import and DOM id resolves, and the
agent registry and limit validation were exercised directly under Node. But the DOM path —
`app.js` boot order, the modal, and the panes rendering — is untested.

The procedure is in `wiki/environments/setup.md`: load unpacked, walk the working list
above, then run the `db.js` round-trip and its two negative paths from the console.

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
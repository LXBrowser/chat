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

### Memory

* `.agents/memory/state/repository-state.md` — what exists, what does not, and the next
  obvious step.
* `.agents/memory/tasks/agents-setup.md` — record of this scaffold.
* `.agents/memory/tasks/extension-foundation.md` — record of the design-system scatter and
  the extension shell.

## Not in this release

Stated plainly so nobody mistakes the interface for a working product:

* `app.js` and `background.js` do not exist.
* No OpenRouter client, no streaming, no API-key handling — the blocking modal is markup
  only.
* No agent orchestration: no spawn, no monitor, no synthesis, no dropdown auto-remove.
* No search tool, no background fetcher, no HTML scraping.
* No file import, no drag-and-drop wiring.

Every control for the above exists in the markup and does nothing.

## Notes

* `LICENSE` pre-existed this release and was already MIT © 2026 LXBrowser. It was not
  modified.
* The repository has **no `.gitignore`**, so `/.agents/plans/` is not excluded. The working
  plan can be published by a `git add -A` until the owner adds the rule. See
  `.agents/memory/state/repository-state.md`.
* The design system at `.agents/design/` departs from the shared set's five-tree
  directory mandate, by explicit owner instruction. Recorded in `AGENTS.md` §Placement.
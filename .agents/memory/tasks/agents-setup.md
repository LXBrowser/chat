---
name: memory-tasks-agents-setup
description: Record of the agent-instruction scaffold — mode, branch, what was created, decisions taken, and what was proposed but not selected.
---

# Task — agents setup

Branch `docs/agents-setup`, branched from `master`.

| # | Task | Branch | Status |
|---|---|---|---|
| 1 | Agent instruction scaffold | `docs/agents-setup` | Done |

### Task 1 — `docs/agents-setup`

**Goal.** Give the repository an instruction system, a knowledge system, and a memory
system, so that later work has something to route on.

**Mode.** B (consumer). The `lxagents-shared-instruction` connector is available, so the
shared set is read over it rather than vendored. Set version adopted: `3.4.0`.

**Created.**

* `AGENTS.md` — entry point and activation contract. Connector bootstrap reproduced
  verbatim, the auto-activation contract with all four permission gates inline, the shared
  instruction tools block with the four mandatory tools, reading order, routing protocol,
  iron rule, placement, the discovery-protocol block, the version rule, and the
  no-session-links line. No rule bodies.
* `README.md` — overview only, with documentation pointers.
* `.agents/index/` — `root-index`, `agents-index`, `agent-wiki-index`,
  `project-wiki-index`, `memory-index`, `logs-index`.
* `.agents/rules/repository.md` — project rules, Mode B stated.
* `.agents/wiki/context/repository-map.md` — orientation page.
* `.agents/memory/state/repository-state.md`, `.agents/memory/tasks/agents-setup.md`,
  `.agents/memory/tasks/extension-foundation.md`.
* `wiki/information/overview.md`, `wiki/environments/setup.md`, `wiki/environments/env.md`.
* `wiki/logs/0/1/0/CHANGELOG.md`.

**Not touched.** `LICENSE` already existed and already read MIT © 2026 LXBrowser, so it
was correct and no `chore(license)` commit was made.

**Decisions.**

| Question | Answer | Source |
|---|---|---|
| Mode | B (consumer) | Owner confirmed |
| License | MIT, © 2026 LXBrowser, 2026 | Already in the repository |
| Initial version | `0.1.0` | Owner; drives `wiki/logs/0/1/0/` |
| Default branch | `master` | The remote's `HEAD` |
| Connector transport | HTTP | Already registered locally |
| Shared tools declared | 13 shared rows + 1 local row | Narrowed to what this repo does |

The shared tools block was narrowed deliberately. `auto_activation` says a consumer
declares the subset it uses and that a narrower table is the point, so the 34 published
tools became the 13 whose triggers this repository actually meets — plus one local row for
`.agents/rules/repository.md`. The four mandatory tools are all present and unstamped rows
were not invented.

**Proposed but not selected.** None. The owner answered the project-intent question, so
§1.5 selection applied; the mandatory core set plus the local `rules/` folder was the whole
proposal, and it was the owner's stated intent to build.

**Carried forward.**

* The `.gitignore` rule for `/.agents/plans/` is still missing, and still the owner's to
  add. Recorded in the working plan and in
  [`.agents/memory/state/repository-state.md`](../state/repository-state.md).
* The design tree at `.agents/design/` departs from the five-tree mandate. Approved by
  explicit owner instruction; recorded in `AGENTS.md` §Placement so it is not read as an
  accident.
* The commit-trailer question resolved in favour of keeping `Co-Authored-By:` — the shared
  `commit_conventions` permits a line naming a tool and forbids only session identifiers.

This is the repository's first task record. Every later one takes the same shape: the task
table above, then one `### Task k — {branch}` entry per task.
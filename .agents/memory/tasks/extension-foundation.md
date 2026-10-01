---
name: memory-tasks-extension-foundation
description: Record of the design-system scatter and the MV3 extension shell — the task table plus a per-task entry appended as each branch lands.
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
| 1 | Plan record | This file, written before the work | LXBrowser/chat | `docs/agents-setup` | `.agents/memory/tasks/` | |
| 2 | Design system | Scatter `DESIGN.md` one subject per file | LXBrowser/chat | `docs/design-system` | `.agents/design/`, `.agents/index/` | |
| 3 | Extension shell | Manifest, database layer, three-pane UI | LXBrowser/chat | `feat/chat-extension` | `manifest.json`, `src/` | |

The `PR` column stays empty until every branch is pushed. Filling it back afterwards would
leave the earlier pull requests behind and force a rebase of the whole stack.

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
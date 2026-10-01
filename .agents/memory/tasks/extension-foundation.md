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

### Task 2 — `docs/design-system`

Scattered `DESIGN.md` into `.agents/design/`, one subject per file.

**Landed.** Thirteen files: `principles`, `tokens-palette`, `tokens-glass`,
`tokens-geometry`, `glass-surface-recipe`, `overlay-opacity`, `components`,
`layout-chrome`, `runtime-includes`, `css-organization`, `reusability`, `accessibility`,
`extension-adaptation`. Every section of `DESIGN.md` maps to exactly one of them.

`extension-adaptation.md` is new — `DESIGN.md` described a system for static
documentation sites and said nothing about a product UI. It records what carries over
unchanged, what the extension changes, and — most usefully — that
`overlay-opacity.md` is binding on two specific surfaces.

**Router placement.** `design-index.md` went to `.agents/index/`, not to
`.agents/design/`. The directory mandate forbids an index inside its own scope, and that
applies to a tree the mandate does not sanction either. The design tree is the exception to
the *tree list*, not to the *index placement* rule.

**Added in the same commit,** so no commit in the stack carries a broken link: the
`design-index.md` row in `root-index.md`, the local row in `AGENTS.md`, and the pointer in
`README.md`.

**What the next task now depends on.** Task 3 copies `tokens-palette`,
`tokens-glass`, and `tokens-geometry` into `src/ui/css/tokens.css` **verbatim** — same
names, same values, no renaming. The agent-status dropdown and the OpenRouter modal must
be opaque, per `overlay-opacity.md`. Anything else task 3 styles should be a component from
`components.md` rather than new CSS.
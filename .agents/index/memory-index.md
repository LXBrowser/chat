---
name: memory-index
description: Index of .agents/memory/ — dynamic state and per-task records. Read every session, because continuity depends on it.
---

# Memory index

Parent: [`root-index.md`](root-index.md).

**Read every session.** Load only the rows whose scope matches the current request, so you
continue prior work instead of restarting it.

Any file added to or removed from this scope is reflected here **in the same commit**.
Memory is written freely and automatically — it is the one tree with no approval gate.

## `state/`

| File | Purpose |
|---|---|
| [`../memory/state/repository-state.md`](../memory/state/repository-state.md) | What the repository currently contains, and what is not yet built. |

## `tasks/`

| File | Purpose |
|---|---|
| [`../memory/tasks/agents-setup.md`](../memory/tasks/agents-setup.md) | Record of the agent-instruction scaffold: mode, branch, decisions, what was proposed but not selected. |
| [`../memory/tasks/extension-foundation.md`](../memory/tasks/extension-foundation.md) | Record of the design-system scatter and the extension shell: the task table, filled per task as the work lands. |
| [`../memory/tasks/ui-overlap-and-modal.md`](../memory/tasks/ui-overlap-and-modal.md) | Record of the second browser run: the composer label spacing, and the discovery that `boot()` was never called. |
| [`../memory/tasks/runtime-and-overlap.md`](../memory/tasks/runtime-and-overlap.md) | Record of the third browser run: the missing `storage` permission that made every storage call throw, and the composer gap. |
| [`../memory/tasks/ui-runtime-bugs.md`](../memory/tasks/ui-runtime-bugs.md) | Record of the fourth browser run: `Object.assign` throwing on `dataset`, which stopped `boot()` before any listener was attached. |
| [`../memory/tasks/send-and-layout.md`](../memory/tasks/send-and-layout.md) | Record of the fifth browser run: a failed send whose reason was swallowed rather than shown, and a centre pane holding the wrong three things. |
| [`../memory/tasks/transcript-and-worker-stability.md`](../memory/tasks/transcript-and-worker-stability.md) | Record of the sixth browser run: the transcript deleting its own answer mid-write, and a worker gone mid-stream that is now retried once and visibly. |
| [`../memory/tasks/e2e-harness-permanent-home.md`](../memory/tasks/e2e-harness-permanent-home.md) | Record of the harness moving out of `/tmp` into `tests/e2e/`, and the build-step rule rescoped to the shipped tree. |
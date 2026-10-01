---
name: memory-tasks-ui-overlap-and-modal
description: Record of the second browser run — the composer label spacing, and the discovery that boot() was never called so the application had never run.
---

# Task — UI overlap and modal

Goal: fix the two defects the second Chrome run reported — the composer label
sitting on the textarea, and the API-key modal never appearing.

Objective: the extension boots, the gate appears when no key is stored, and the
composer's label is separated from its textarea.

Detail: presentation and boot only. `src/ui/app.js` and `src/ui/css/layout.css`.
No version change, no new permission, nothing in the service worker or the tools.

| # | Title | Scope (one line) | Repository | Branch | Files / areas | PR |
|---|---|---|---|---|---|---|
| 1 | Task record | This file, written before the work | LXBrowser/chat | `chore/ui-overlap-and-modal-plan` | `.agents/memory/tasks/` | — |
| 2 | Call `boot()` | The application has never run | LXBrowser/chat | `fix/boot-never-ran` | `src/ui/app.js` | — |
| 3 | Composer label spacing | 0px to 4px above the textarea | LXBrowser/chat | `fix/composer-label-spacing` | `src/ui/css/layout.css` | — |
| 4 | Release | Changelog, the setup checklist, closing entries | LXBrowser/chat | `docs/ui-overlap-and-modal-release` | `wiki/`, `.agents/memory/` | — |

Tasks 2 and 3 touch different files, are independently reviewable, and have no
dependency on each other, so they are separate branches rather than one. Task
*k* branches from task *k-1*'s branch, and its pull request targets that branch.
**No task merges on its own.** Every step waits for the owner.

## The finding, recorded before any of the work

**`boot()` is defined at `src/ui/app.js:90` and is never invoked.** The file ends
at `summariseAnswer()`; there is no `boot()`, no `void boot()`, no auto-run. That
is the only match for the identifier outside comments.

This is not a modal bug. `requireApiKey()` checks storage, `promptForKey()`
clears `modal.hidden`, and `boot()` awaits the gate at line 93 before anything
else — all of it correct, and none of it ever executed. Nor did anything else in
`app.js`: no settings load, no database open, no chat history, no listener on any
control, no agent registry, no port. The page rendered because HTML and CSS need
no JavaScript, which is precisely why the layout looked right while the interface
was inert.

**The earlier verification missed it, and the reason is structural.** The import
scan confirmed every namespace and named import resolves against a real export;
the DOM scan confirmed every id `app.js` reaches for exists in `index.html`; and
102 checks passed. Not one of them executed `app.js`, and the repository has no
DOM harness that could have. Three green results, none of which could observe the
thing that was wrong.

**Owner decisions taken before the work:**

* **Cancelling the gate must not be a dead end.** The gate rejects only on Cancel,
  and because wiring is step 5 the Settings button would have had no listener. So
  the reason is shown under the Send button and Settings reloads to re-open the
  gate. Reloading *on cancel itself* was considered and rejected — it takes away
  the choice.
* **The label keeps 4px rather than staying flush.** The previous round asked for
  a completely flush label and this one supersedes it. 4px is not a new value —
  it is already `.eyebrow`'s own bottom margin.

**What this task does not fix.** Nothing outside `src/ui/` is touched, and the
service worker, the tool loop and the `read_page` guard have still never run in a
browser. Once `boot()` is called the application is live for the first time, and
that is a larger and more expensive first run than "the layout looks right" — it
may well surface further defects. This record does not claim otherwise.

### Task 1 — `chore/ui-overlap-and-modal-plan`

The plan record, written before any of tasks 2–4 so a reviewer can check the work
against what was decided rather than infer it from the diff.

**Landed.** This file, its row in [`../../index/memory-index.md`](../../index/memory-index.md),
and the working plan under `.agents/plans/` — untracked, and confirmed excluded by
`git check-ignore` before anything was written into it.

**Two decisions were the owner's, and both changed the code.** Cancelling the gate
shows the reason under the Send button and makes Settings reload, rather than
reloading on cancel itself. And the composer label gets 4px rather than staying
flush, which reverses the previous round's requirement — recorded here so a later
session does not "restore" the flush and reintroduce the collision.

**What the next tasks now depend on.** Task 2 touches `src/ui/app.js` only and
must not reorder `boot()`'s steps — the gate-before-wiring sequence is what makes
the cancel path recoverable at all. Task 3 touches `src/ui/css/layout.css` only and
must leave `.eyebrow--flush` alone, since it is correct in the three contexts where
the label is not adjacent to the textarea.
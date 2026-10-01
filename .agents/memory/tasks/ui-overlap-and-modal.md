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

### Task 2 — `fix/boot-never-ran`

**Landed.** One line and a catch, at the end of `src/ui/app.js`.

**The invocation sits last in the file, not first.** A module that started itself
at the top would be relying on hoisting it does not get for `const` bindings —
`settings`, `busy`, `systemPrompt` are all initialised by the time boot reads
them, but only because the call is after them. Putting it at the end makes that
a property of the file's order rather than of the spec.

**Cancel is handled rather than left to reject.** The gate rejects only on Cancel,
and because wiring is step 5 nothing below it has run, so the Settings button has
no listener. Unhandled, that is a page which looks alive, does nothing, and has no
way to add a key — a dead end the owner would have hit and could not diagnose. So
the reason is shown under the Send button and Settings reloads, which re-runs boot
and re-opens the gate. **Reload on cancel itself was rejected**: it takes away the
choice, and the owner's call was that cancelling should leave them able to decide.

**A new assertion, written because this class of bug is invisible to the ones that
already exist.** Every top-level function in `app.js` is now checked for being
called: a function whose name appears exactly once in the file is defined and never
invoked. That check fails on the file as task 1 found it and passes now. It runs
from `/tmp` and is not committed, matching the repository's stated position that it
has no test runner — but it is the check that would have caught this, and it costs
one regex.

**Verified.** `boot()` resolves to an invocation. `node --check` passes. No top-level
function is uncalled. Every namespace and named import still resolves against a real
export, and every DOM id `app.js` reaches for still exists in `index.html` — including
`#send-status` and `[data-action="open-settings"]`, which the catch path depends on
and which nothing else in the file uses.

**Not verified — and this is now the largest gap in the repository.** Nothing here
has been *executed*. Until the owner reloads, the correct claim is that `boot()` is
invoked, not that the extension works. The first real run is the one that matters,
and it may surface further defects in code that has likewise never run: the service
worker, the tool loop, and the `read_page` guard.

**What the next task now depends on.** Nothing — task 3 is pure CSS and cannot
affect this. What task 4 does depend on is the honesty of the documentation:
`setup.md`'s checklist, `overview.md`'s "Current state", and `repository-state.md`'s
"What works today" all describe behaviour that has now been shown never to have run,
and none of them may be marked verified on the strength of this commit.

### Task 3 — `fix/composer-label-spacing`

**Landed.** Two values in `src/ui/css/layout.css`.

**`gap: 0` → `4px`, and `.composer__hint`'s `margin-top: 8px` → `4px`.** The second
change is the one that is easy to miss: the gap governs *every* pair of children in
the column, so raising it would have pulled the hint up to 4px from the textarea and
halved the space that was there deliberately. Halving the hint's own margin keeps
label → textarea at 4px and textarea → hint at 8px, so only the reported collision
changes and the rest of the composer is untouched.

**4px is not a new value in this stylesheet.** It is already `.eyebrow`'s own bottom
margin in `components.css`, which is what makes it the right number rather than an
arbitrary one — the design system has no spacing scale, it uses raw pixels, and the
value the label uses everywhere else is the value it now uses against the textarea.

**"Flush" was the previous round's requirement, and it was wrong.** The last task set
`gap: 0` to satisfy an explicit instruction to seat the label completely flush. It
does seat it flush, which is exactly the problem: zero means the label's line box ends
on the textarea's border edge, and at 11px uppercase with letter-spacing the result
reads as collision rather than as alignment. Worth recording because a later session
reading the previous commit would see a deliberate `gap: 0` with a comment explaining
it, and could reasonably "restore" it.

`.eyebrow--flush` is deliberately **not** touched. It is correct in the three places
the label is not adjacent to a textarea — the title bar, the agent cap and the model
picker — and adding margin there would double the spacing `.model`'s own `gap: 6px`
already provides.

**Verified.** The column computes label → textarea at 4px and textarea → hint at 8px.
No inline style reintroduced; both stylesheets brace-balance; the 102 checks still
pass.

**Not verified — the rendering, again.** Nothing in this repository can observe
whether 4px reads as separated at the real font size. That is the owner's eye, and it
is a one-glance check.
---
name: memory-tasks-runtime-and-overlap
description: Record of the third browser run — the missing storage permission that stopped every API call, and the composer label spacing.
---

# Task — Runtime and overlap

Goal: fix the two faults the third Chrome run reported — every storage call throwing, and
the composer label sitting on the textarea.

Objective: `chrome.storage` resolves on the new-tab page, the failure message names the
actual fault rather than a bare `TypeError`, and the composer label is separated from its
textarea.

Detail: `manifest.json`, `src/ui/app.js`, `src/ui/css/layout.css`. No version change — it
stays `0.1.0` — and no change to how the API key is stored, read, or passed.

| # | Title | Scope (one line) | Repository | Branch | Files / areas | PR |
|---|---|---|---|---|---|---|
| 1 | Task record | This file, written before the work | LXBrowser/chat | `chore/storage-context-fallback-plan` | `.agents/memory/tasks/`, `memory-index.md` | |
| 2 | Storage permission and an honest failure message | The manifest declares no `permissions` at all | LXBrowser/chat | `fix/storage-context-fallback` | `manifest.json`, `src/ui/app.js` | |
| 3 | Composer label spacing | `gap: 4px` → `6px`, matching `.model` | LXBrowser/chat | `fix/composer-label-spacing` | `src/ui/css/layout.css` | |
| 4 | Release | Changelog, checklist, state, closing entries | LXBrowser/chat | `docs/runtime-and-overlap-release` | `wiki/`, `.agents/memory/` | |

Task *k* branches from task *k-1*'s branch and targets it. **No task merges on its own.**

## The finding, recorded before any of the work

**`manifest.json` has no `permissions` key.** Not a wrong one — none. It declares
`host_permissions` and a CSP, and in between them nothing.

In Manifest V3 `chrome.storage` is injected into an extension's pages only when `"storage"`
is declared in `permissions`. Undeclared, `chrome.storage` is `undefined`, so
`chrome.storage.local.get()` throws `TypeError: Cannot read properties of undefined
(reading 'local')` on the first call — which is exactly the message that appeared beside the
Send button.

**It is not an extension-context fault.** The first hypothesis was, and it is worth
recording why it is wrong, because it cost a round and it is a natural mistake:

* `chrome_url_overrides.newtab` is served from the extension origin. There is no mechanism
  by which Chrome serves it over `http://` or `file://`. If the override fails to load,
  Chrome discards it and shows the default new tab page — it never falls back to loading the
  file as a web page.
* The symptom proves it. The message reached `#send-status`, which only the `boot().catch()`
  handler added in the previous task can write to. That means the module loaded, executed,
  ran to step 1 of `boot()`, rejected, and was caught. A page without an extension context
  cannot get that far — `chrome` itself would be missing.
* **`chrome.runtime` present while `chrome.storage` is absent is the signature of a missing
  permission.** `src/ui/lib/openrouter.js:123` already carries the guard for a genuinely
  absent context — `typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id)` — and it
  passed, or nothing downstream of it would have run.

**The service worker was equally dead, and that is the larger half.** `src/background.js`
reads the key from `chrome.storage` in its own context. Even with a key stored, no OpenRouter
request could ever have been made. Every one of the previous task's "unverified" caveats
about the tool loop, the streaming path and the port sat behind this one line.

**Only two Chrome APIs are used in the whole extension**, confirmed by sweeping `src/`:
`chrome.storage` and `chrome.runtime`. `chrome.runtime` needs no permission. So
`"permissions": ["storage"]` is the complete and correct set — nothing unused, which is what
the repository rule about permissions requires.

**The failure message was a fault in its own right.** A bare `TypeError` next to a Send
button, with Settings silently reloading, gave no way to tell a missing permission from a
missing context from a cancelled gate — which is precisely why the first hypothesis was
wrong. The message is now part of the fix, not a footnote on it.

## Owner decisions taken before the work

* **One branch for tasks 1–4, not one per task.** The owner initially asked for a single
  `fix/runtime-and-overlap-bugs`. The task *k* branches from task *k-1*'s branch in any
  case, so the stack is the same either way; what differs is the count.
* **No toolbar popup.** It was proposed as a "guaranteed extension context" and rejected on
  two grounds: a popup is an extension page for exactly the same reason the new-tab page is,
  so it fails identically without the permission; and this workspace is a full-tab app whose
  layout is built on a viewport, while a popup closes the instant it loses focus — which
  `promptForKey()` guarantees, since it focuses its input and traps focus.
* **The composer gap goes to `6px`, matching `.model`.** Not a new value: `.model` is the
  only other vertically-stacked flush eyebrow in the pane and already uses it. The composer
  at `4px` was the tightest flush label in the design.

## What this task does not fix

**The composer label cannot be verified here.** The committed CSS computes roughly 17px of
clearance between the glyphs and the border, so it cannot produce the reported picture; the
report is most likely a stale stylesheet, since "text sitting exactly on the border line" is
what `gap: 0` renders and that is what PR #9 shipped. The value is corrected on consistency
grounds either way, and the owner can settle it in one line at the console —
`getComputedStyle(document.querySelector('.composer')).gap` returns `6px` on current CSS and
`0px` on a stale one, and only the second of those is a reload problem.

**Nothing else has run in a browser either.** Adding the permission unblocks the modal, the
model dropdown, Settings, the port, the service worker, the tool loop and `read_page` — and
every one of those will be executing for the first time when the owner reloads. Expect
further defects. This record does not claim otherwise.

### Task 1 — `chore/storage-context-fallback-plan`

The plan record, written before any of tasks 2–4 so a reviewer can check the work against
what was decided rather than infer it from the diff.

**Landed.** This file, its row in [`../../index/memory-index.md`](../../index/memory-index.md),
and the working plan under `.agents/plans/` — untracked, and confirmed excluded by
`git check-ignore` before anything was written into it.

**What the next tasks now depend on.** Task 2 must add exactly one permission and no other,
and must not reorder `boot()` — the gate-before-wiring sequence is what makes the cancel path
recoverable. Task 3 touches `layout.css` only and must leave `.eyebrow--flush` alone, since
it is correct in the three contexts where the label is not adjacent to the textarea. Task 4
depends on the honesty of the documentation: nothing may be marked verified on the strength
of this stack, because the owner's runtime test is the only thing that closes it.

### Task 2 — `fix/storage-context-fallback`

**Landed.** One permission in `manifest.json`, and a precondition check in `src/ui/app.js`.

**`"permissions": ["storage"]`, and nothing else.** Sweeping `src/` turns up exactly two
Chrome namespaces: `chrome.storage`, which needs this, and `chrome.runtime`, which needs
none. So the set is complete and carries no unused permission.

**The check runs before `boot()`, not inside it.** `startupFault()` names the two faults
separately — no extension context, and no `storage` permission — and the page reports which
one it is instead of surfacing whatever the first storage call happened to throw. This is
the fix for the diagnosis problem, which was the part of the owner's report that was right:
a bare `TypeError` next to a Send button, with Settings silently reloading, gave no way to
tell the two apart. **Naming them separately is what would have saved the round.**

**The reload is now offered only where it can help.** The `startupFault()` branch disables
Send and says why; it deliberately does *not* wire Settings to reload, because a reload on a
manifest fault lands on the same page with the same problem. That is precisely the loop the
owner saw — clicking Settings and getting a reload of an already-broken context — so the
reload now lives only on the path where re-running `boot()` re-opens the gate, which is a
cancelled one. Send is disabled on the fault path rather than left enabled and inert, which
is what the previous run looked like.

**A check that would have caught this when `storage.js` was written.** The fault class is
"a manifest that nothing asserts against" — the same shape as the uncalled `boot()`, and it
survived 102 green checks. So there is now a sweep: every `chrome.<api>` dereferenced in
`src/` must be declared in `permissions` or be one of the namespaces that need none, and no
permission may be declared that is unused. **It passes on the fixed manifest and fails on the
pre-fix one**, naming `storage` and the three files that use it — that negative control is
the only reason it is worth anything, since a check that cannot fail has not been run.
It lives in `/tmp` and is not committed, matching the repository's position that it has no
test runner.

**Verified.** `permissions` is exactly `["storage"]`; version still `0.1.0`; the manifest
parses; `node --check` passes on every module in `src/`; no top-level function in `app.js`
is uncalled; every DOM id `app.js` reaches for exists in `index.html`; no inline style
attribute anywhere in `src/`; the 102 existing checks still pass, plus 3 from the new one.

**Not verified — and this is the whole point of the task.** Adding the permission means the
application will run for the first time. The modal, the model dropdown, Settings, the
service worker, the port, the tool loop and `read_page` have all been unreachable behind
this one line and none of them has executed in a browser. **The owner's next reload is the
first live run of almost everything in this repository**, and further defects are expected.

### Task 3 — `fix/composer-label-spacing`

**Landed.** Two values in `src/ui/css/layout.css`, and one deleted rule.

**`.composer`'s gap `4px` → `6px`, matching `.model`.** `.model` is the only other
vertically-stacked flush eyebrow in the right pane and already uses 6px. At 4px the composer
was the tightest flush label in the design — inconsistent with its two siblings for no
stated reason, and it is the one sitting against a control large enough that a small gap
reads as collision. Matching an existing value rather than choosing one is what keeps a
second number out of a system that has no spacing scale.

**`.composer__hint`'s rule is deleted rather than retuned.** It carried 8px once, then 4px,
purely to defend a gap the flex column already provides — it existed only because the gap had
been 0. Left in place at 6px it would have needed `margin-top: 2px`, which is a shim that
breaks the next time anyone edits the gap, and it is what made the space *below* the textarea
a different number from the space *above* it. The class stays on the element in `index.html`
and is still styled by `.lead` and `.hint`; only its one-off rule is gone. The reason is
recorded on `.composer` itself, so the next session that finds the missing rule finds the
explanation next to the value that replaced it.

**`.eyebrow--flush` is deliberately not touched**, for the third time and for the same
reason: it is correct in the three contexts where the label is not adjacent to the textarea,
and a margin there would double the spacing those containers already provide.

**Verified.** The column computes label → textarea at 6px and textarea → hint at 6px; `.model`
computes 6px; `layout.css` brace-balances; all 105 checks still pass.

**Not verified — the rendering, again, and it is the third round on this one label.** The CSS
committed before this task computed roughly 17px of clearance between the glyphs and the
border, which cannot produce the reported picture, so the likeliest explanation is a stale
stylesheet: "text sitting exactly *on* the border line" is precisely what `gap: 0` renders,
and that is what PR #9 shipped. This task corrects the value on consistency grounds either
way. **The owner can settle it in one line** at the console —
`getComputedStyle(document.querySelector('.composer')).gap` returns `6px` on current CSS and
`0px` on a stale sheet, and only the second of those is a hard-reload problem rather than a
code one.

### Task 4 — `docs/runtime-and-overlap-release`

**Landed.** Five documents, and the substance of this task is what they now decline to
claim rather than what they assert.

**"No API permissions" was corrected in two places, and it was the misleading kind of
true.** The changelog and `env.md` both said the manifest requests no API permissions — no
`activeTab`, no `tabs`, no `scripting` — which was accurate and implied there was nothing
to declare. There was: the array did not exist. Both now show the real manifest, and `env.md`
gains a section on why `storage` fails loudly and `sync` is never asked for.

**The checklist gains the check that would have settled the diagnosis in one line.** Step 1
used to assume the modal would appear and say nothing about what to do when it did not. It
now stops the run at that point, names the two faults the page can report, and points at a
new *Check the page has its permissions* section — one console line that distinguishes a
missing permission from a page that is not running as an extension. That distinction is the
one that cost the round.

**"After changing files" now says to open a new tab**, which is the likeliest explanation
for a stale-stylesheet report: reloading the extension card does not re-fetch anything for
a new-tab page that is already open, so a change can look like it did nothing.

**A duplicated blockquote was removed from `setup.md`.** The "a pane that looks right is not
proof that anything works" warning appeared twice, identically, in step 1 — a leftover from
an earlier edit that a reviewer had not caught and no check looks at. It is now one block,
and it names both faults rather than only the first.

**`overview.md` and `repository-state.md` now describe three runs, not two.** Both said the
application had never run; the accurate statement is that no run has exercised a line of
behaviour *to completion*, and that the third was the first live execution of anything in
`app.js`. The distinction matters, because "nothing has run" would be false.

**Verified.** `permissions` is exactly `["storage"]`; version still `0.1.0`; every module
passes `node --check`; `boot()` resolves to an invocation with no uncalled top-level
function; every DOM id resolves; no inline style attribute anywhere in `src/`; both
stylesheets brace-balance; all 105 checks pass; no session link in any commit in this stack.

**What the owner has to do, and it is the biggest job in the repository so far.** Reload
the extension, accept the re-prompt for the new permission, and open a **new** tab. That run
executes the gate, the model picker, Settings, the port, the service worker, the tool loop
and `read_page` for the first time — every one of them was waiting behind this one line.
**Expect further defects.** This record claims the code paths exist and that two of them
were unreachable; the owner's runtime test is the only thing that closes any of it.

## Done

All four tasks merged. **Still nothing in this stack has been observed running**, and the
permission fix is what makes the next run the first real one. That is the next session's
work, not this one's.
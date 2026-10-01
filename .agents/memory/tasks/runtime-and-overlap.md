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
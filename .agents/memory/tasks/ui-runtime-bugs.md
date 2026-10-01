---
name: memory-tasks-ui-runtime-bugs
description: Record of the fourth browser run — Object.assign silently corrupting dataset attributes, and a boot rejection that made every control inert.
---

# Task — UI runtime bugs

Goal: fix the runtime UI faults the fourth Chrome run reported — unclickable history and
agent entries, and controls that do nothing at all.

Objective: `data-*` attributes are written as real attributes rather than stringified into
one `data-value`, and a boot failure names the step that failed instead of showing a raw
message behind a Settings button that reloads.

Detail: `src/ui/lib/views.js`, `src/ui/app.js`. No version change — it stays `0.1.0` — and
no change to how the API key is stored, read, or passed.

| # | Title | Scope (one line) | Repository | Branch | Files / areas | PR |
|---|---|---|---|---|---|---|
| 1 | Task record | This file, written before the work | LXBrowser/chat | `chore/ui-runtime-bugs-plan` | `.agents/memory/tasks/`, `memory-index.md` | #20 |
| 2 | Write dataset keys properly | `Object.assign` cannot write dataset keys, so history and the agent dropdown are unclickable | LXBrowser/chat | `fix/dataset-attributes` | `src/ui/lib/views.js` | #21 |
| 3 | Name the failing boot step | A runtime rejection shows a raw message and makes Settings reload | LXBrowser/chat | `fix/boot-step-reporting` | `src/ui/app.js` | #22 |
| 4 | Release | Changelog, checklist, state, closing entries | LXBrowser/chat | `docs/ui-runtime-bugs-release` | `wiki/`, `.agents/memory/` | #23 |

Task *k* branches from task *k-1*'s branch and targets it. **No task merges on its own.**

## The finding, recorded before any of the work

**`el()` in `src/ui/lib/views.js` cannot write a dataset.** It builds elements with
`Object.assign(node, props)`, and three call sites pass `dataset: { … }`:

| Written by `views.js` | Read by `app.js` |
|---|---|
| `dataset: { sessionId: s.id }` (line 71) | `[data-session-id]` (line 161) |
| `dataset: { deleteSessionId: s.id }` (line 79) | `[data-delete-session-id]` (line 151) |
| `dataset: { agentId: a.id }` (line 259) | `[data-agent-id]` (line 204) |

`Object.assign` performs `[[Set]]` on each key, in strict mode because this is an ES module.
`HTMLElement.dataset` is declared `[SameObject] readonly attribute DOMStringMap` — it has
**no setter at all**. So the assignment **throws**:

```
TypeError: Cannot set property dataset of #<HTMLElement> which has only a getter
    at Object.assign (views.js:26)   ← el()
    at renderHistory (views.js:63)
```

**It does not fail silently, and I was wrong that it did.** Reasoning from the IDL I
concluded that `PutForwards` would forward the value and stringify the object, and I told the
owner the reported error "cannot come from this code" and that the defect threw nothing. It
throws, on the first element it touches, every time. **The owner's report was accurate and my
correction of it was not.** That is recorded here because the error is now the whole task.

## The single root cause behind all six reported symptoms

**`boot()` rejects at step 4, so step 5 never runs — and step 5 is where every listener is
attached.** `refreshConversation()` calls `views.renderHistory()`, which builds the history
rows through `el()`, which throws on the first `dataset`. Everything before it succeeds;
everything wired after it never happens.

That is why six unrelated controls were reported dead at once, and it was confirmed by
running the extension:

| Reported | Cause |
|---|---|
| Settings does nothing | step 5 never ran; the catch wired Settings to `location.reload()` — the "refreshes the page" symptom |
| Multi-agent toggle inert | step 5 never ran |
| Dropzone and browse do nothing | step 5 never ran |
| Send and Clear broken | step 5 never ran; the failure message is the same `TypeError` |
| `dataset` getter error | the fault itself |
| History empty and unclickable | `renderHistory()` threw before writing a single row |

**And the Model dropdown is not actually broken** — it populates correctly, because
`renderModel` is step 2 and runs before the failure. An empty dropdown was the key gate
being open with no key stored: `boot()` is suspended at step 1 and everything after it is
legitimately waiting. The "duplicate Model section" was also not real — one `.model`
container, one `#model-select`, 34 unique ids, zero duplicates.

## The harness that made this knowable

**Playwright loads the unpacked extension here.** `launchPersistentContext` with
`--load-extension` registers the service worker, the new-tab page boots, and every control
can be clicked. Chromium needed `npx playwright install-deps` for `libatk` and the rest.

It is installed in `/tmp`, not the repository — `npm init` at the root would create a
`package.json` and break the "no package manager, no build step, no dependencies" rule. It
stays uncommitted, like every other check here.

**This closes the gap three rounds of green checks could not.** A boot that never ran, a
manifest with no permissions, and a `dataset` that threw on first use all passed 105 checks,
because none of them executed `app.js`. One of them now does, and it took under a minute to
find a defect that no amount of reading had pinned down.

## Owner decision

A placeholder key is written into a throwaway browser profile so `boot()` gets past the gate.
It is not a credential, it never enters the repository, and the profile is deleted when the
process exits.

## What this task does not fix

**A live OpenRouter call.** The harness has no key and no intention of having one, so
everything past `wireComposer()`'s send path — the port, the service worker, streaming, the
tool loop — is still unobserved in a browser. What this task verifies is that the controls
*respond*, not that a request succeeds.

### Task 1 — `chore/ui-runtime-bugs-plan`

The plan record, written before any of tasks 2–4 so a reviewer can check the work against
what was decided rather than infer it from the diff.

**Landed.** This file, its row in [`../../index/memory-index.md`](../../index/memory-index.md),
and the working plan under `.agents/plans/` — untracked, and confirmed excluded by
`git check-ignore` before anything was written into it.

**What the next tasks now depend on.** Task 2 touches `views.js` only and must not change
the `data-*` *names* — `app.js` selects on them, so renaming one silently re-breaks the click
handler it was supposed to serve. Task 3 touches `app.js` only and must not reorder `boot()`:
the gate-before-wiring sequence is what makes the cancel path recoverable, and moving
listeners earlier would let a half-wired page look alive. Task 4 depends on the honesty of
the documentation, which — written before task 2 ran — said no control in this stack had
been observed working. **Task 2 falsified that**, and task 4 rewrote it rather than keeping
it: the interface is confirmed in a browser, the request path is not.

### Task 2 — `fix/dataset-attributes`

`el()` now unpacks `dataset` into the `DOMStringMap` key by key, and everything else still
goes through `node[key] = value` on the same pass. The `data-*` **names are unchanged** —
`app.js` selects on them, so renaming one would have silently re-broken the click handler
it was written to serve.

**It works, and the harness says so.** 19 checks against the real extension in Chromium,
all passing, no page errors: boot completes, the key gate closes, the model dropdown
populates, `data-session-id` is a real attribute, and every control answers — history rows
switch chats, delete removes one, the title input follows, the multi-agent toggle flips
`aria-pressed`, Settings opens the modal and Cancel closes it, Clear empties the textarea,
Send enters its busy state, stores the prompt, reports the outcome and re-enables, and a
dropped file is listed.

**Three of the four things the harness first reported as broken were the harness.** Worth
recording, because the instinct on a second run is to go looking for a second product bug:

| Reported as failing | Actually |
|---|---|
| `current()?.title` is `undefined` | `current()` returns the **id**; `getCurrent()` returns the record |
| clicking the last row does not switch chats | the list is **newest-first**, so the last row is the one already open |
| Send never responds | the dropzone click had raised a **native file picker** nobody answered, stalling the page before Send ran |

The fourth — the dropzone's `fileInput.click()` — is a real property of the product, not a
fault: it simply cannot be driven headlessly. The test drops a file through a synthetic
`DragEvent` instead, which is the path that was reported.

**A new static check, `/tmp/wt/dataset.test.mjs`, 17 assertions.** It asserts both
directions, because both fail silently: that `el()` never returns to `Object.assign`, that
every key is lowerCamelCase (which is what makes `sessionId` land as `data-session-id`),
that every `[data-…]` selector in `app.js` matches a key `views.js` writes, and that every
key `views.js` writes is read. Verified in both directions — it fails on the pre-fix file
and fails on a deliberate one-sided rename.

**The check is not committed**, like every other check here: the repository has no package
manager, no build step and no runner, and this one needs a live DOM to mean anything.

### Task 3 — `fix/boot-step-reporting`

A boot failure is now shown as `Startup failed at 4 · history: <message>`, not as the bare
message. `boot()` keeps its order exactly as it was — the gate still resolves first and the
listeners are still wired last, because that sequence is what makes a cancelled gate
recoverable and a half-wired page impossible.

**The gate is deliberately not a numbered step.** Cancelling the API-key modal is a
decision, not a fault; tagging it "step 1 failed" would tell the owner their browser is
broken when they said no. So it stays outside `step()` and its own message still surfaces.

The step name leads the message and the original `err.message` is still there after it — the
name says where to look, the message says what happened, and neither alone was enough.

**Proven by breaking each step in turn**, in a throwaway copy of the tree staged under
`/tmp` and deleted after: all four report the right step, a healthy boot stays silent, and
no case blames the gate. A second check, `/tmp/wt/bootsteps.test.mjs`, 11 assertions, keeps
the header's load-order list and the step labels from drifting apart — which they had
already done once, before the numbers meant anything.
### Task 4 — `docs/ui-runtime-bugs-release`

Changelog, setup checklist, repository state, overview, and this record.

**The documentation claim this task had to fix was written in task 1 and was wrong by the
time task 4 started.** Task 1 predicted that task 4 would document "that no control in this
stack has been observed working", and task 2 falsified it. Rewriting the docs to the
measured position is the whole job here: the interface is confirmed in a browser, the
request path is not, and the two are now separated explicitly in all four documents rather
than merged into one hedge.

The counts were re-derived rather than carried over: 122 Node checks, 19 browser checks, and
the four Chrome runs.

**The setup checklist's scope is now split.** Step 1 has been driven. Steps 2–12 begin at
**Send something** and need a billable call, so they have never been run by anyone and are
labelled as such rather than presented as a passed list.

## Closed

All four merged to `master` as #20, #21, #22 and #23, in that order. The tree on `master`
is byte-identical to the tip of `docs/ui-runtime-bugs-release`.

**The squash-ancestry trap fired again, and the re-target-first rule prevented the worse
half of it.** Merging #20 with `--squash` left #21 `CONFLICTING`, exactly as the previous
stack recorded. Two things were done differently and both helped:

* **No `--delete-branch` on any merge.** In the previous stack that flag auto-closed a PR
  mid-chain. Every merge here passed `--delete-branch=false`, all four PRs were re-targeted
  to `master` *by hand* before each merge, and the branches were deleted only at the end.
* **The rebase was verified by tree diff, not by ancestry.** `merge-base --is-ancestor` is
  useless after a squash. `git diff origin/master..HEAD` against the rebased branch showed
  exactly the intended change and nothing else, before every force-push.

The first `git ls-remote` after #23's push hung, and the force-push silently did not land
— PR #23 was still open against its old base. It was caught by re-reading the PR state
rather than assuming the command had worked, and re-run in the background.

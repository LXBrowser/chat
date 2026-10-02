---
name: memory-tasks-transcript-and-worker-stability
description: Record of the sixth browser run — the transcript deleting its own answer mid-write, and a worker gone mid-stream that is now retried once and visibly.
status: done
---

# Task — Transcript and worker stability

Started 2026-10-01. Closed 2026-10-02.

Goal: fix the two faults the sixth Chrome run reported — messages appearing to disappear
and overlap in the centre pane, and `Send failed: The background worker went away`.

Objective: a completed answer stays on screen continuously from its first chunk to its
stored copy; a worker that dies mid-answer is reconnected and retried once, with the
re-bill visible; and a request the worker already answered is never retried.

Detail: `src/ui/lib/views.js`, `src/ui/css/layout.css`, `src/ui/lib/openrouter.js`,
`src/background.js`, `src/ui/app.js`. No version change — it stays `0.1.0` — no new
permission, and the API key still never leaves the worker.

| # | Title | Scope (one line) | Branch | Files / areas |
|---|---|---|---|---|
| 1 | Task record | This file, written before the work | `fix/transcript-and-worker-stability` | `.agents/memory/` |
| 2 | Stop losing the answer | `discardStream()` deleted the answer before the write that restores it | " | `views.js`, `app.js` |
| 3 | Harden the transcript | Messages could shrink; nothing stopped a horizontal scrollbar | " | `layout.css` |
| 4 | Keep-alive and honest failure | Ping/pong while in flight; a disconnect that names itself | " | `openrouter.js`, `background.js` |
| 5 | One visible retry | A lost worker is reconnected and retried once, out loud | " | `app.js`, `openrouter.js` |

One branch, merged into `master`. No pull request.

## What the report said, and what the browser said

**Two reported items were real. One was not a defect at all, and one fix the report asked
for does not address the error it was aimed at.** Recorded before the work, because a
record written afterwards would present the report as correct.

### 1. The layout was already correct

Measured in a real Chromium with the extension loaded:

| | Measured |
|---|---|
| Short exchange | user `right=0`, agent `left=0`, `align-self` correct |
| 14 long messages | no overlap, no clipping, `scrollHeight > clientHeight` |
| 600-char unbroken token | wraps, no horizontal overflow |

`.msg` already declared `max-width: 78%` and `align-self: flex-start`; `.msg--user`
already declared `align-self: flex-end`; `.transcript` already carried `min-height: 0`
and `overflow-y: auto`. There are no floats in this layout to clear.

**There was no alignment defect to repair, and the task does not invent one.** The
hardening in step 3 turns values that hold today into values that cannot stop holding —
`flex: none` on `.msg` and `overflow-x: hidden` on `.transcript` — and is recorded as
hardening rather than as a fix. Two of the three layout checks fail on the pre-fix tree
(`flex-shrink: 1`, `overflow-x: auto`) and pass now; they fail because the values were
absent, not because anything looked wrong.

### 2. The real defect: the answer deletes itself

`runMainAgent()` called `views.discardStream()` **before** `sessions.appendMessage()`. The
removal was synchronous; the write and the repaint that restored it were not. Observed
with a `MutationObserver`, not inferred:

```
pre-fix:   streamText=43 total=48  →  msgs=1 total=5  →  msgs=2 total=48
fixed:     total rises monotonically from the first chunk to 90
```

**This happened on every single successful send**, not intermittently — which is why
"messages sometimes disappear" reads as intermittent: it is the gap between the removal
and the repaint, and on a short transcript it closes before it is noticed. If the write
fails, the answer the user just watched stream is gone from the interface for good.

The fix is one line: `discardStream()` clears the reference and leaves the node. Clearing
`stream` gives the repaint exactly what it needs — no live node to carry across, so its
rebuild replaces it with the stored copy — and nothing has to wait for anything. It also
means a failed write leaves the answer readable.

### 3. The reported error reproduced exactly

Killing the worker mid-stream through CDP produced the reported line, character for
character:

```
console: Send failed: The background worker went away.
```

That string is the **fallback** branch of the disconnect handler, taken when
`chrome.runtime.lastError` carries nothing — which is what happened. It was the same
sentence for every distinct cause, and it named a guess.

### 4. A ping would not have fixed it

Measured both ways against a stream quiet for 45 seconds, longer than Chrome's idle
window, **with no ping at all**: the stream completed normally. A pending `fetch` already
holds the worker alive.

**So the periodic ping the report asked for is not the fix for the failure that was
reproduced.** It keeps the worker warm between sends, which is worth having and is cheap.
It does not survive an extension reload, memory pressure, or Chrome's five-minute request
cap — none of which is prevented by a port message. What survives those is reconnecting
and retrying, which is step 5.

The ping is implemented because it was asked for. **It is not credited with a fix, and
the plan file says so in the same terms.**

## Owner decisions

* **Auto-retry once, visibly.** The owner chose a retry that announces itself —
  `"Reconnecting…"` in the status row — over a silent one, because a retry triggered by a
  failure the user is watching is a second billable call. The trade is accepted; the
  visibility is the condition.
* **One branch, merged into `master` locally, no pull request.** For a fast clean fix
  without GitHub PR overhead.
* **No version bump.** Every item here is user-visible and a bump is the owner's call.

## What changed

**`views.js`.** `discardStream()` no longer removes the node. `renderTranscript()`'s
empty-state branch now carries the live node across — it returned without doing so, so a
repaint against an empty session destroyed the streaming bubble and left `stream` pointing
at a detached node, after which every delta was appended into nothing. `clearStream()`
added, for the retry to empty a bubble without taking it away.

**`layout.css`.** `.msg` gets `flex: none` — in a *column* flex container the axis these
items shrink on is height, and every message was computing `flex-shrink: 1`, so a bubble
was willing to be squashed. `.transcript` gets `overflow-x: hidden`, with the reason
recorded: a horizontal scrollbar shifts every bubble relative to every other one, which is
what "overlap awkwardly" looks like from the inside.

**`openrouter.js`.** Ping every 20s **only while `pending.size > 0`**, stopped by
`settle()` and by disconnect — a permanent timer would hold a worker open for a tab nobody
is talking to. `pong` handled instead of falling through. Transport failures build an
error carrying `retryable`, exported as `isRetryable()`. A `postMessage` throw now nulls
the cached port, because `onDisconnect` does not always fire for a recycled worker and a
stale port left in place fails every later call with no way back.

**`background.js`.** Answers `ping` with `pong` — an inbound message is what resets
Chrome's idle timer. `MAX_TOOL_ROUNDS` gains a comment explaining why its bound is
inclusive.

**`app.js`.** Repaints are serialised. Two were able to run at once — each awaits the
database before rebuilding — and the slower wrote its older snapshot over the newer one,
which can repaint the transcript without an answer that was already stored. A change
arriving mid-repaint is coalesced into one more, not dropped. `runMainAgent()` retries
once on a retryable failure, shows `Reconnecting…`, and clears the interrupted text on the
retry's first chunk so two answers are never concatenated into one stored message.

## Withdrawn: the tool-loop bound

This plan initially claimed the loop bound was off by one. Re-read against the code, **it
is not**: `round = 0 … 6` runs tools on rounds 0–5 — six tool rounds — and round 6 is a
final chance to answer with what it already has. "Stopped after 6 rounds of tool calls
without an answer" is accurate. What was missing was the explanation, which is now a
comment. **The task changes no behaviour here, and it is recorded as a correction to the
plan rather than quietly dropped.**

## Verification

| Harness | Fixed | Pre-fix |
|---|---|---|
| `/tmp/pw/verify.mjs` — 24 browser checks | 24/24 | 8 fail |
| `/tmp/pw/verify-ping.mjs` — keep-alive | 3/3 | 2 fail |
| `/tmp/pw/static.mjs` — structural invariants | 11/11 | — |

**The pre-fix column is the point.** Every new check was run against a worktree of
`master` and observed failing, with the expected signature: `total fell 90 → 18 → 90`,
`flex-shrink: 1`, `overflow-x: auto`, `The background worker went away.` with **0**
retries, and no `pong`. A check that cannot fail has not been run — which is how `boot()`
being defined and never called, the manifest's missing `permissions`, and `el()` throwing
on `dataset` each passed a green round first.

The status row through a killed worker, observed rather than sampled:

```
Working… · 1 running  →  Reconnecting… · 1 running  →  Writing… · 1 running  →  Answer ready
```

Also confirmed: **a 401 is never retried** — one request, and the reason is shown. That is
the check that keeps the retry from becoming an expensive loop, since a retry that
re-asked a rejected question would spend a call to be refused identically.

## Not claimed

* **No live OpenRouter call.** The request path is driven against a scripted SSE body
  through `context.route` at the browser-context level, which is what lets it survive the
  worker restarts these tests are about. The port, the parser, delta assembly, storage and
  repaint all run; the model is not OpenRouter's.
* **The ping is not credited with fixing the reported error**, because the measurement
  says a pending fetch already keeps the worker alive.
* **A five-minute answer is still cut.** Chrome's cap is not something a port message can
  lift. That case now retries once and then says so, which is the best available.

## Still open

* **`plan_creator` and the rest of the shared set were unavailable this session.** The
  `lxagents-shared-instruction` connector was reachable and healthy, but its tools were
  not loaded into the model's tool list, and a session that cannot call a shared tool
  cannot follow the shared conventions that tool defines. Reported as discovery findings
  rather than worked around from memory.
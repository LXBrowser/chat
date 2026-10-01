---
name: memory-tasks-send-and-layout
description: Record of the fifth browser run — a failed send whose reason was swallowed rather than shown, and a centre pane that held the wrong three things.
status: in-progress
---

# Task — Send and layout

Started 2026-10-01.

Goal: fix the send defect the fifth Chrome run reported, and restructure the centre pane and
the API-key modal as specified.

Objective: a failed request states its reason under the Send button instead of presenting as
a Send that does nothing; the centre pane holds exactly the model picker, one live status
row, and the conversation; and a stored key is masked in the page rather than read into it.

Detail: `src/ui/app.js`, `src/ui/index.html`, `src/ui/lib/views.js`, `src/ui/lib/agents.js`,
`src/ui/lib/api-key.js`, `src/ui/lib/storage.js`, `src/ui/css/`. No version change — it stays
`0.1.0` — and the key still lives only in `chrome.storage.local`, read only by
`src/background.js`.

| # | Title | Scope (one line) | Repository | Branch | Files / areas | PR |
|---|---|---|---|---|---|---|
| 1 | Task record | This file, written before the work | LXBrowser/chat | `chore/send-and-layout-plan` | `.agents/memory/tasks/`, `memory-index.md` | — |
| 2 | Show why a send failed | `runMainAgent()` swallows every failure, so the composer reports success on a 401 | LXBrowser/chat | `fix/send-failure-visibility` | `src/ui/app.js` | — |
| 3 | Restructure the centre pane | Model picker, one live status row, and the transcript — and no log, no dropdown | LXBrowser/chat | `refactor/centre-pane-restructure` | `index.html`, `views.js`, `agents.js`, `app.js`, `layout.css`, `components.css` | — |
| 4 | API-key edit flow | A stored key is masked and never read into the page; only Update writes | LXBrowser/chat | `feat/api-key-edit-flow` | `api-key.js`, `storage.js`, modal markup, `components.css` | — |
| 5 | Release | Changelog, checklist, state, closing entries | LXBrowser/chat | `docs/send-and-layout-release` | `wiki/`, `.agents/memory/` | — |

Task *k* branches from task *k-1*'s branch and targets it. **No task merges on its own.**

## What the report said, and what the code says

**Four items came in. One is a real defect, three are not what they were described as, and
two of those three are new work rather than repairs.** This is recorded before the work
because a record written afterwards would present the report as correct.

### 1. "Send does nothing" — the chain is wired; the failure is swallowed

Traced end to end: `send()` (`app.js:265`) → `runMainAgent()` (`app.js:464`) →
`openrouter.chat()` (`openrouter.js:141`) → `port.postMessage({type:'chat'})` →
`chrome.runtime.onConnect` (`background.js:74`) → `handle()` → `streamChat()` →
`fetch('https://openrouter.ai/api/v1/chat/completions')`. Every hop exists, the manifest
declares a module service worker, and `storage` is declared.

**The defect is the last line of the function:**

```js
} catch (err) {
  agents.fail(agent.id, err.message);
  views.endStream();
}                                          // ← no rethrow
```

`runMainAgent()` catches everything into the agent log and never rethrows, so `send()`'s
`catch` never fires, `sendNote` is cleared on the way through, and the composer reports
success. **A 401, a 402, an empty answer, a dead worker all present as a Send that does
nothing.** The reason was written the whole time — into a log pane the owner was not
looking at.

That matches the report exactly and explains it. The fix is a rethrow, and it is the whole
of item 1.

### 2. "User messages render in the left sidebar" — the transcript is in the left pane

`renderTranscript()` (`views.js:110`) writes to `$('transcript')`, and that is where the
messages go. `#transcript` is declared inside the **left** pane at `index.html:59–68`,
stacked above `#history` in the same `.pane__body`. There is no rendering bug; the element
is simply in the wrong pane. This is a structural move, and `renderTranscript()` should
keep targeting `#transcript` unchanged.

### 3. The single status row is new wiring

`#agent-status-line` exists at `index.html:94` and is **referenced by no JavaScript at all** —
it is a static "Live log" label beside the append-only `<pre id="agent-log">`. A row that
changes in place cannot be a view of the log: `agents.log()` accumulates by design, and
`renderLog()` rebuilds the whole element from `agents.logLines()`. A single status row has to
be a separate signal that never appends.

### 4. Message alignment does not exist

`.msg--user` (`layout.css:208`) sets only `background: var(--accent-soft)`. There is no
`align-self` and no `max-width` on either side, so both bubbles are full-width and
left-aligned. Right/left alignment is new CSS, not a repair.

### 5. The API-key modal

Real, and specified in detail. There is no edit/mask state in `api-key.js` today: the modal
always renders an editable empty input, and `changeApiKey()` returns the saved key to its
caller, which is the last path by which the credential reaches page JavaScript.

## Owner decisions

Three forks were put to the owner and answered:

* **The agent dropdown and the append-only log are removed outright**, not hidden or
  narrowed. The status row replaces the log completely: *"A clean, single-line UI is the
  priority here over debugging history."*
* **The status row carries the agent count in its text**, which is what replaces
  `#agent-count-badge`.
* **The key uses a fixed placeholder that is never read.** The stored value is not pulled
  into the page at all; `Edit` unlocks an empty field; only **Update key** writes.

## What this task does not fix

**A live OpenRouter call.** Still no key, still no billable request. What changes is that the
**request path itself** is now executed: the service worker's `fetch` is replaced in the
worker context with a scripted SSE body, so the port, the SSE parser, delta assembly,
`chat_messages` storage and the repaint all run — for a stub, not for OpenRouter. That is a
step past the last three releases, which stopped at the request path; it is still not a
real answer, and the documentation will say exactly that.

### Task 1 — `chore/send-and-layout-plan`

This file and its row in [`../../index/memory-index.md`](../../index/memory-index.md).

**The shared set was reachable the whole time, and I reported that it was not.** Earlier in
this session I stated plainly that the `lxagents-shared-instruction` connector was
unavailable, that `plan_creator` could not be called, and that the two shared discovery
findings could not be written because there was no shared set to write them into. All three
were wrong. The server was configured, connected, and serving the full set — its tools just
had not been loaded into my tool list, and I read that absence as the absence of the set.

What made it a mistake rather than a limitation is that `auto_activation` covers this exact
case: *"Where a client exposes no tools, the model is unchanged — the declaration block
names the same conventions, and each is read as its `agents://` resource instead."* I never
read that file, because I had already decided I did not need to. `mcp_connector`'s
bootstrap block covers "the connector is not available" and prescribes saying so — which is
what I did, faithfully, from a premise that had never been checked. **A gate followed
correctly on a false premise is still a failed gate**, and the cost was a whole planning
phase run without the conventions that govern it.

The plan itself is **not** written into `.agents/plans/`. That folder is untracked and
excluded by `.gitignore`, which is the owner's; the decision this record exists to capture
is captured here.

**What the next tasks now depend on.** Task 2 changes only how a failure travels, and must
not change *what* counts as a failure — a tool that errors mid-run is the agent's problem
and is already recorded, while a transport failure is the owner's. Task 3 removes the agent
monitor, which means task 2 lands on `master` with nowhere to report an agent-level problem
except the transcript; that is acceptable inside a stack and never on its own. Task 4
deletes `storage.getApiKey()`, so any call site task 3 leaves behind has to be gone before
task 4 runs, and the static check for it is written against the pre-fix tree.

### Task 2 — `fix/send-failure-visibility`

One statement added, in `runMainAgent()`'s catch: `throw err`. That is the entire code
change. Everything else is comments that were stating the opposite.

**The failure was invisible, not absent.** That is the distinction the fifth run turned on,
and it is worth being exact about: a 401 did exactly what it should, the reason was written
down, and nobody saw it. Every layer above the catch behaved correctly *given* that the
catch did not rethrow. The fix is not "make send report errors" — it always did — it is
"stop discarding them one function later".

**Both halves of the change were needed.** The rethrow alone would have set `sendNote` to
the reason; the `sendNote = ''` line was already correct as written and needed no change.
What did need changing was the comment above the catch, which claimed *"Failures inside an
agent are reported in its log"* — true, and precisely the bug. A comment asserting the
behaviour that is being fixed is the kind of thing that survives a fix and misleads the
next reader, so it went with it.

**What does not reach this catch, and why the distinction is safe.** A tool that fails
mid-run never arrives here: the worker hands the failure back to the model as a failed tool
result (`{ok: false, error}`) and the conversation continues, so `openrouter.chat()` resolves
normally. Everything in this catch is therefore a genuine request or transport failure, and
rethrowing all of it is correct rather than blunt.

**Proven, not asserted.** The service worker's `fetch` is replaced in the worker context
with a scripted body, so the whole chain runs — port, SSE parse, deltas, assembly,
`chat_messages`, repaint — with no key and no billable call. Three modes, run against this
branch and against the pre-fix tree:

| Mode | Pre-fix | This branch |
|---|---|---|
| 401 | `send-status` hidden, nothing anywhere | `OpenRouter returned 401 — No auth credentials found` |
| empty answer | `send-status` hidden | `The model returned an empty answer.` |
| success | answer stored, survives reload | **unchanged** — still stored, survives reload |

The success row is the one that matters most, because it is the first time anything has run
the request path at all. It went green on the pre-fix tree too, which is the proof that this
task fixed the reporting and nothing else: streaming, assembly and persistence were never
broken.

**A real 401 confirmed it by accident.** The browser regression runs *without* the stub, so
it sent a real request with the placeholder key and got a genuine `401 — User not found`
back — and the page reported it. That was not planned and cost nothing, and it is the
strongest single piece of evidence here, because nothing was stubbed.

**Five new static checks**, `/tmp/wt/senderror.test.mjs`, verified in both directions: 5/5
on this branch, 2 failing on the pre-fix tree. It asserts the rethrow *and* that the catch
still marks the agent failed before throwing — a "fix" that replaced the catch with a bare
`throw` would pass a one-directional check and lose the agent's own state.

138 Node checks and 19 browser checks still pass.

**That figure was a partial count, and it is corrected at the end of task 3.** The whole
suite across all twelve files is **170**, not 138 — the earlier tally ran nine of them. The
number in `repository-state.md` now reads 170 and matches a full run.

### Task 3 — `refactor/centre-pane-restructure`

**The centre pane holds exactly three things, and it holds them in the order the owner gave.**

`index.html` — the model picker moved out of the right pane whole, `#transcript` moved from
the **left** pane to the centre, and a new `.activity` row sits between them. The left pane's
title changed from "Conversation" to "Chats", because the conversation is no longer there;
the centre's became "Conversation". The right pane lost the model block and gained nothing.

`renderTranscript()` **did not change.** That is the point of report #2: there was never a
rendering bug. The renderer always targeted `$('transcript')`; `#transcript` was simply
declared in the wrong `<section>`. So the element moved and the function stayed, which is why
this task is a `refactor:` rather than a `fix:`.

**The status row is one node, structurally.** `views.setActivity(text)` assigns `textContent`
to the existing `<span>`; there is no code path that appends. `white-space: nowrap` with
`overflow: hidden; text-overflow: ellipsis` makes it one line *by construction* rather than
by the length of the text — I first wrote `overflow-wrap: anywhere`, caught that it would let
the row become two lines, which is the exact outcome ruled out, and replaced it.

The append-only log could not be kept alongside it. `agents.log()` accumulated lines into a
`<pre>` by definition; a row that changes in place and a log that grows are different
surfaces, and the owner chose the row. So `agents.js` lost `logs`, `log()`, `logLines()`,
`clear()`, `get()`, `isActive()` and `records`, and kept the whole lifecycle —
`spawn`/`finish`/`fail`/`list`/`activeCount`/`subscribe` — which is all the row and its count
need. `#agent-count-badge` went with it: the count folds into the row's own text as
`Working… · 1 running`.

**Announcement volume went down, deliberately.** `#transcript` carried `aria-live="polite"`
and is rewritten on every streamed token — a chatty live region. The status row now takes
`role="status"` and the streaming bubble takes `aria-busy`. This is a real accessibility
trade, not a cleanup: fewer interruptions, at the cost of the transcript no longer announcing
itself. Recorded as such rather than presented as an improvement.

**Two pre-existing contrast defects, in blocks I was already editing.** `.msg__role` and
`.send-status` both used `--ink-400` on glass, and `accessibility.md` is explicit that
`--ink-400` clears only `--white` and `--silver-050`. Both moved to `--ink-500`. Found
because the new row had to pick a token for the same job and the answer was already
contradicting itself two rules away.

**A false documentation claim, found because I had rewritten the file it was about.**
`repository-state.md` stated that the static suite covered "the agent registry". Nothing in
`/tmp/wt` touched it. `/tmp/wt/registry.test.mjs` now does, with 13 checks.

#### Verification

| Harness | Result | Pre-fix |
|---|---|---|
| `/tmp/pw/layout.js` — 24 browser checks | 24/24, no page errors | fails |
| `centrepane.test.mjs` — structure and placement | 11/11 | 5 pass / 6 fail |
| `statusrow.test.mjs` — one row, no append | 12/12 | 1 pass / 11 fail |
| `registry.test.mjs` — the lifecycle the row needs | 13/13 | n/a (new file) |

**The browser check is the one that matters, because the requirement was the one static
checks cannot prove.** "The text must change in place and never spawn a line" is not a
property of the source; it is a property of the DOM over time. So `/tmp/pw/layout.js` attaches
a `MutationObserver` to the status text node *before* sending and records every state it
passes through:

```
Working… · 1 running   dot dot--running   aria-busy=true
Writing… · 1 running   dot dot--running   aria-busy=true
Answer ready           dot dot--done      aria-busy=false
```

Two things fall out of observing the node rather than sampling it. The sequence is complete —
no state was missed by polling too slowly, which is exactly how my first attempt failed, twice,
before I stopped sampling. And an observer attached to an element that gets *replaced* simply
stops reporting, so the trace continuing through to `Answer ready` is itself proof the node
was never swapped. Alongside it: `#activity` carries a sentinel property set before the send
and still present after; the pane's child count is 3 before and 3 after; the row is 36px tall
before and 36px after.

**Alignment is measured, not declared.** `agent left=345 user left=767`, pane `345…855` —
the user's left edge is right of the agent's, the agent's is flush with the stream's left
edge, and neither overflows. A rule that is present in the stylesheet and overridden later
still lays out wrong, so reading the CSS would not have been the check.

**Three of my own test bugs, none of them product bugs.** `body()` searched `function send(`
where the code is `const send = async () => {`; the dot selector assumed `id` preceded
`class`; and a `doesNotMatch(/\.dot--error/)` matched the *comment in components.css*
explaining why there deliberately is no `.dot--error`. That last one is the check working as
intended in the wrong direction — the answer was already correct, and the comment says why.

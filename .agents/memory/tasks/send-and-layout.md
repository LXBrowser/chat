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

138 Node checks (up from 133) and 19 browser checks still pass.

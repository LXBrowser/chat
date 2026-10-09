---
name: memory-tasks-send-failures
description: Record of a reported failed send — the tool-round limit that ended a send in an error instead of an answer, and models with no tool support that could not be used at all.
status: in-progress
---

# Send failures: the tool-round limit and models without tools

A screenshot of Chrome's extension Errors page showed `Send failed:` logged from
`src/ui/app.js:336`, in `send()`, from a real browser with a real key. The message itself was
cropped out of the image. The line number matches the merged `master`, so the build in use had
the previous round's changes. The owner asked for the failure to be found and fixed, the pull
requests opened, and the branches merged in order with rebase, and was not available to answer
questions, so each choice below was made as the recommended option and recorded.

## What was found

The message is unknown, so the cause below is the most probable one, not a confirmed one.

* **A send ended in `Stopped after 6 rounds of tool calls without an answer.`** Reproduced with
  a stub shaped like OpenRouter's real stream: a model that keeps calling `search_web` while the
  search page returns an anti-bot response makes seven requests, none of which tells it to stop
  calling tools, and the send fails. The code and an earlier record both call the last request
  "a final chance to answer", but nothing in that request forbade tools, so the chance was a
  hope and not a mechanism. The system prompt tells the model to search and to read pages
  rather than answer from snippets, so a research-style prompt can use all six rounds without
  anything being broken.
* **A model with no tool support could not be used.** OpenRouter refuses any request carrying
  tools to such a model (404, "No endpoints found that support tool use"). The extension always
  sends tools, so every send failed with the provider's text. The catalogue lists 68 of 458
  models without `tools`; both presets in the picker support them, so only the custom model
  field reaches this.
* **Ruled out:** a plain answer with keep-alive comments and a usage chunk, an OpenAI-shaped
  tool call with split arguments, and multi-agent mode all send normally. The previous round's
  changes did not break sending. A reasoning-only stream ends in "The model returned an empty
  answer.", which is accurate, and is unchanged.

## Goal and objective

A send that uses tools should not end in an error when the model could simply answer, and a
model that cannot use tools should still be usable. Done when the last request forbids tools
and the send succeeds; a failing search tells the model to stop; a model that rejects tools is
retried once without them, visibly; everything else is unchanged; and every new check fails on
the tree before its fix and passes after.

## Decisions

* **Version stays `0.1.0`** and its changelog is amended: it was never released or tagged, and a
  bump is a claim for the owner.
* **The last request is sent with `tool_choice: 'none'` and the tools still declared.** Dropping
  `tools` would break providers that need them declared once a conversation holds tool calls.
  The backstop error stays for a model that ignores it, and now names what was called.
* **`MAX_TOOL_ROUNDS` stays at 6.** A higher cap raises cost; the fix makes the limit non-fatal.
* **A model that rejects tools is retried once without them, and the status row says so.** The
  refusal comes before any generation, so the retry is not a second charge. The trigger is an
  HTTP 400, 404 or 422 whose message names missing tool support; any other error is untouched.
* **Search-failure advice lives in the tool result, not the system prompt.** The prompt is
  seeded into IndexedDB once and never refreshed, so a prompt edit would not reach an existing
  install.
* **Not changed:** the DuckDuckGo parser, synthesis, the seeded prompt.

## Tasks

| # | Title | Branch | PR |
|---|---|---|---|
| 1 | The task record | `chore/send-failures-plan` | |
| 2 | The tool-round limit | `fix/tool-round-limit` | |
| 3 | Models without tools | `fix/tool-less-models` | |
| 4 | The release | `release/0.1.0` | |

## 2026-10-09

### Task 3 — fix/tool-less-models

The extension declares its tools on every send. OpenRouter refuses such a request to a model
with no tool support — a 404, "No endpoints found that support tool use", before anything is
generated — so with a custom model id of that kind every send failed with the provider's text and
the app was unusable. Reproduced with a stub that answers 404 to any request carrying `tools`.

`converse` in `src/background.js` now retries the **first** request once without tools when the
error is an HTTP 400, 404 or 422 whose message names missing tool support (`isToolSupportError`,
four narrow patterns, each tying tools to a lack of support within one sentence). It appends a
sentence to the system message of that conversation saying the model cannot call tools, because
the seeded prompt says it can and is never refreshed, and posts a new non-terminal `notice`
message so the page can say so. `openrouter.js` hands a notice to `onNotice`; `app.js` keeps it
in the status row for the rest of the send as `activityNote`, apart from `activity`, which the
first token would have overwritten. The one-`done`-or-`error` guarantee is untouched. The retry is
not a second charge: the refusal comes before generation.

Checks are section D of `tests/e2e/verify-worker.mjs`. On the previous task's commit 36 of 42 pass
and the six failures are the fault: the 404 reaches the user, nothing is stored, only one request
is made, no notice, no system sentence. The three controls pass on both trees by design — a 404
about a missing model, a 401, and a 400 about a tool schema are each shown as they are and not
retried. On this branch all 42 pass. Both presets support tools (checked in the catalogue), so
only the custom model field reaches this; 68 of 458 catalogue models list no `tools`.

Not established: the exact wording a given provider uses. The OpenRouter message is written from
its documented behaviour and not captured from a live refusal; the other patterns cover other
phrasings and are untested against a real one.

Documentation changed in the same commit: `wiki/environments/env.md` (what happens with a model
that cannot use tools, and the catalogue count with its date) and `wiki/environments/setup.md`
(step 18).

### Task 2 — fix/tool-round-limit

`converse` in `src/background.js` ran rounds 0 to 6 and threw at round 6 if the model was still
asking for tools. The `transcript-and-worker-stability` record defended that as correct because
round 6 is "a final chance to answer with what it already has". The arithmetic was right and the
claim was not: the request at round 6 was identical to the ones before it, tools declared and
nothing said, so a model that wanted a tool simply asked for another and the send failed.

The last request is now sent with `tool_choice: "none"` and the tools still declared, because a
conversation that holds tool calls needs them declared on some providers. If the model ignores
it the loop still throws, now as `Stopped after 6 rounds of tool calls without an answer
(search_web ×6).` Every way `search_web` fails now ends with a sentence telling the model to stop
searching and answer from what it knows. That advice is in the tool result because the system
prompt is seeded into IndexedDB once and never refreshed, so an edit to the bundled prompt would
not reach an existing install. `send()` now logs the error object instead of only its message, so
a fault in the page's own code keeps its stack on the Errors page.

Checks are section C of `tests/e2e/verify-worker.mjs`, against a stub that keeps calling
`search_web` unless a request pins `tool_choice: "none"`, with the search page answering like a
bot challenge. On `master` 27 of 32 checks in the file pass and the five failures are the fault:
`Stopped after 6 rounds…`, nothing stored, no request pinned, no advice in the search result, no
tool summary. On this branch all 32 pass. The harness stub `routeRaw` now accepts a function of
the request and a JSON error body, which task 3 also uses.

Not established: that this is the failure in the screenshot. It reproduces the logged line from a
realistic flow, but the message was cropped; a 401, 402 or 429 would look the same in the log.

Documentation changed in the same commit: the `setup.md` failure row for this message, a new
hand-test step 17 (block `*duckduckgo.com*` and ask for something current), and the limit line in
`repository-state.md`. `static`, `smoke`, `verify-ui`, `verify-ping` and sections A–E of `verify`
are unchanged.

### Task 1 — chore/send-failures-plan

Created this record and its row in `memory-index.md`. No code changed. The task list above is
the plan the work follows; each later task appends its own entry in its own commit.

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

### Task 1 — chore/send-failures-plan

Created this record and its row in `memory-index.md`. No code changed. The task list above is
the plan the work follows; each later task appends its own entry in its own commit.

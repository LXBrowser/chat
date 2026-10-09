---
name: memory-tasks-chat-integrity
description: Record of the integrity fixes found by reading the whole repository and running it — chats that cannot be deleted, answers filed in the wrong chat, read_page failing on redirects, stream parsing, and the harness startup race.
status: in-progress
---

# Chat integrity and redirects

A full read of the repository plus runs in Chromium with OpenRouter, DNS and every
`read_page` target stubbed turned up faults the static suite and the earlier browser runs
could not see. Each is reproduced before it is fixed, and each new check is shown failing on
the tree before its fix.

## Goal and objective

Stop the extension losing and misfiling the user's data, and make `read_page` work on the
ordinary web. Done when:

1. A chat that has messages can be deleted, and its messages go with it.
2. An answer, the user's turn and `update_chat_title` land in the chat the send started in.
3. `read_page` reads a URL that redirects to a public page and refuses one that lands on a
   private address.
4. The stream parser no longer corrupts tool calls, hides provider errors or drops a last
   frame.
5. Enter on Cancel in the key modal stores nothing.
6. The dropzone says its files are not sent.
7. The browser harness starts on a current Chromium, and the docs stop claiming what is
   false.

## Decisions

* **Branches.** One per task, stacked, named by the shared convention. The session's default
  branch name is not used: the convention lists tool-preset prefixes as bad names.
* **Version stays 0.1.0.** The repository has no release and no tag, so 0.1.0 was never
  released and its changelog may be amended in place. A bump is the owner's call and was not
  requested.
* **`read_page` follows redirects and re-checks where it lands** instead of checking every
  hop. A browser cannot read `Location` from a manual redirect, so a per-hop check is not
  possible. Accepted cost: a public page that redirects to a private address still causes
  one request to it before the refusal; nothing is read or returned. The rule text that says
  "before the request" is an instruction file and is raised as a finding, not edited.
* **The dropzone gets a label, not a feature.** Reading attached files is a separate
  decision.
* **Out of scope:** the DuckDuckGo parser (needs a live capture from a machine that can reach
  the host), synthesis, sub-agent tools, cancel, and every instruction file.

## Tasks

| # | Title | Branch | PR |
|---|---|---|---|
| 1 | The task record | `chore/chat-integrity-plan` | |
| 2 | Harness startup | `test/e2e-harness-startup` | |
| 3 | Delete a chat | `fix/chat-delete` | |
| 4 | Chat routing | `fix/chat-routing` | |
| 5 | Redirects in read_page | `fix/read-page-redirects` | |
| 6 | Stream parsing | `fix/stream-parsing` | |
| 7 | Key modal Enter | `fix/key-modal-enter` | |
| 8 | Dropzone label | `fix/dropzone-label` | |
| 9 | Claims already stale | `docs/stale-claims` | |
| 10 | The release | `release/0.1.0` | |

## 2026-10-09

### Task 3 — fix/chat-delete

`deleteSession` in `src/db.js` took its message keys from the `session_id` index and then
called `.delete()` on the index. An `IDBIndex` has no `delete`, so any chat holding a
message threw `messages.delete is not a function`: the chat and its messages stayed, and
the interface showed nothing. An empty chat never reached the line, which is why "delete
works" had been recorded as confirmed. The keys still come from the index; the delete now
goes through the object store.

`tests/e2e/verify-ui.mjs` is new and is where the next UI checks go. Its delete section
seeds chats through `db.js` with real messages and includes an empty-chat control. On the
pre-fix tree 4 of 9 checks pass and five fail with `messages.delete is not a function`, the
chat still listed, the session still stored and two messages left; on this branch 9 of 9
pass. The file also refuses any request to OpenRouter and counts it (0).

Documentation changed in the same commit: `wiki/information/overview.md`,
`wiki/environments/setup.md` (step 14) and `.agents/memory/state/repository-state.md` no
longer imply delete had been checked on chats with messages. `npm test` gained `verify:ui`.

Later tasks add their UI checks to `verify-ui.mjs` and reuse its `seedChat`, `stored`,
`deleteChat` and `titles` helpers.

### Task 2 — test/e2e-harness-startup

`launch()` now waits until the worker has `chrome.runtime` and `chrome.storage` before it
hands the worker back (`ready()` in `tests/e2e/harness.mjs`). Chrome announces a service
worker before it injects those APIs, so a test that evaluated in that window saw a `chrome`
object holding only `loadTimes` and `csi`, and `chrome.storage.local` threw a `TypeError`
that reads like a manifest with no `storage` permission. A worker that really lacks them
now times out with a message that says so.

`awaitWorker(context)` replaces `context.serviceWorkers()[0]` in section F of `verify.mjs`.
It tries every known worker and waits for the next announcement when none answers. It is
called `awaitWorker`, not `liveWorker` as the plan first named it, because `verify.mjs`
already has a local called `liveWorker`.

Shown failing and passing, not assumed: before, `smoke.mjs` died in `seedKey` with
`Cannot read properties of undefined (reading 'local')`; after, it runs to completion. With
the change, `static` is 11/11, `verify-ping` 3/3, and sections A–E of `verify.mjs` pass.

**Left open — section F of `verify.mjs` cannot finish inside the full run on Playwright
1.56.1.** That is the version installed locally to match the sandbox's Chromium; the
declared range is `^1.63.0`. After D stops the worker, Chrome starts a new one (it appears
in the browser's target list once the page sends again), but Playwright keeps listing the
dead handle and emits no `serviceworker` event, so no live handle can be found. Section F
run on its own on a fresh launch passes 4/4, so its logic is unaffected. Not verified on
the declared range. Locally, routing worker requests on 1.56.1 also needed
`PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1`; without it the stub is bypassed.

Later tasks add their checks in new files rather than to `verify.mjs`, so they are not
affected by section F.

### Task 1 — chore/chat-integrity-plan

Created this record and its row in `memory-index.md`. No code changed. The confirmed list
above is the plan the owner approved; later tasks append their own entries here in their own
commits.

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

### Task 1 — chore/chat-integrity-plan

Created this record and its row in `memory-index.md`. No code changed. The confirmed list
above is the plan the owner approved; later tasks append their own entries here in their own
commits.

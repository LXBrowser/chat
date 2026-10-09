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

### Task 5 — fix/read-page-redirects

`read_page` fetched with `redirect: 'manual'` and read `Location` off the response. A browser
returns a manual redirect as an opaque response — type `opaqueredirect`, status 0, no
headers — so the branch that followed a redirect could never run, and every redirecting URL
(apex to `www`, a trailing slash, a shortener) reached the model as
`read_page failed: <host> returned 0.` The earlier records listed "whether Chrome returns a
readable `Location`" as unobserved; it is now observed, and it does not.

`fetchChecked` in `src/tools.js` now checks the URL it is given before the request exactly
as before, fetches with `redirect: 'follow'` and `credentials: 'omit'`, and, when the request
was redirected, applies the same https and address checks to where it landed (`checkLanding`).
A refused landing is cancelled with its body unread and the error names both hosts. The hop
loop, `MAX_REDIRECTS` and `redirectTarget` are gone; Chrome limits redirect chains itself.

**The cost, measured and accepted by the owner:** the landing can only be checked after the
request is sent, so a public page that redirects to a private address, a private name or
plain `http` still causes one GET to it, without cookies, before it is refused. Nothing it
returns is read. The checks assert exactly one request to each refused landing. Separately,
the manifest grants `https` hosts only, so Chrome blocks reading an `http` response unless
the server sends `Access-Control-Allow-Origin`; the test server sends it so the extension's
own scheme check is the thing under test.

Checks are `tests/e2e/verify-worker.mjs`, new, run through the whole chat flow: the model asks
for a page and the observable is the `tool` message in the second request. On the tree
before the fix (the task 4 commit) 3 of 9 pass and every redirect case fails with
`example.test returned 0.` and zero requests reaching any landing; on this branch all 9 pass:
a direct URL (control), a redirect within a site, a redirect to another public origin, and
refusals of a loopback landing, a name that resolves to `10.0.0.5`, and an `http` landing.

**The redirects are real, not stubbed, and that took work worth keeping.** A stubbed `302`
cannot test this on Playwright 1.56.1: the redirected follow-up request is never delivered
to a route and the worker's fetch fails with a bare `Failed to fetch`. The harness gained
`startSite()` (an https server and an http server on loopback with a certificate minted by
`openssl` into a temporary directory, so no key is committed), `SITE_ARGS` (resolver rules
that map three invented hostnames to loopback, `--ignore-certificate-errors`, and
`--no-proxy-server`), `routeDns()`, `routeRaw()`, and `launch({ args })`.
`--no-proxy-server` is required: Chromium on Linux honours `https_proxy` from the environment,
which this sandbox exports, and a name mapped to loopback went through the proxy and never
reached the server. One mistake of mine cost time and is recorded so it is not repeated:
`startSite` built the request handler before the servers were listening, so the redirect
targets were built with port 0, Chrome refused them as an unsafe port, and every cross-origin
redirect looked like a Chrome limitation. It was the helper.

Left stale on purpose: the sentence in `.agents/rules/repository.md` that a tool fetching a
model-supplied URL must check "before the request" cannot hold for redirects in a browser.
It is an instruction file, so it is raised as a finding for the owner and named in the pull
request body, not edited here. Not tested: any real site, real DNS-over-HTTPS, or a real
redirect chain longer than one hop.

Documentation changed in the same commit: `wiki/environments/env.md` (guard section),
`.agents/wiki/context/repository-map.md` (the restatement is replaced by a link),
`.agents/memory/state/repository-state.md`, and `wiki/environments/setup.md` (step 16 and a
row in the failure table). `npm test` gained `verify:worker`.

Task 6 adds its stream checks to `verify-worker.mjs` and uses its `say`, `call`, `DONE`,
`send` and `stubRounds` helpers with `routeRaw`.

### Task 4 — fix/chat-routing

A reply takes seconds and the history list stays clickable, but everything the send did when
it finished used "the open chat" at that moment. Reproduced with a stubbed, delayed
response: ask in A, click B before the answer arrives, and A kept only the question while B
received the assistant's answer. The same cause sent `update_chat_title` to the open chat,
and the streaming bubble was carried into whichever chat was repainted.

`send()` now fixes the chat when Send is pressed and passes that id through the auto-title,
the stored user turn, the context read, `runMainAgent`, the title tool
(`runPageTool(name, args, { sessionId })`) and the final write. `sessions.js` gained
`getSession(id)` and `renameSession(id, title)`; `renameCurrent` delegates. In `views.js` the
streaming node remembers its chat (`streamSession`): it is attached only to its own chat's
transcript, stays detached and keeps collecting text elsewhere, and is put back when its
chat is reopened. A chat deleted mid-answer now ends the send with `This chat was deleted
before the answer arrived.` before the status row reads "Answer ready", instead of filing
the answer under whichever chat is open.

Checks are section B of `tests/e2e/verify-ui.mjs`. For this task the tree before the fix is
the task 3 commit, not `master`: on bare `master` the delete fault from task 3 would have
overlapped with the routing faults. On that tree 17 of 25 pass and the eight routing checks
fail (the bubble in the wrong chat, A without its answer, B holding it, the wrong chat
renamed, the answer filed under another chat, no notice that the chat was deleted); on this
branch all 25 pass. One check, the bubble returning when its own chat is reopened, passes on
both trees by design, because before the fix the bubble followed the person everywhere. It
was shown able to fail by mutation: with the re-attach removed from a scratch copy, it fails
and the other 24 pass.

Not changed, and noted for whoever reads this next: only one send runs at a time across all
chats (`busy` is global), so a person who leaves a chat mid-answer cannot send from another
chat until it finishes. That was already the behaviour and is a separate decision.

Documentation changed in the same commit: `wiki/environments/setup.md` (step 15). `static`,
`smoke`, `verify-ping` and sections A–E of `verify.mjs` are unchanged.

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

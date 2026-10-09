---
name: memory-state-repository-state
description: What the repository currently contains at 0.1.0 — the working chat surface, the orchestration that does not, and the next obvious step.
---

# Repository state

As of `0.1.0`, 2026-10-01.

## Mode

**Mode B (consumer).** The shared instruction set resolves through the
**`lxagents-shared-instruction`** MCP connector over HTTP at
`https://lxagents-mcp-shared-instruction.onrender.com/mcp`. Set version adopted: `3.4.0`.
Nothing from the set is vendored — there is no `git/`, `prompts/`, or `creators/` folder
here, and the override table in the root index is empty.

**The connector registers and reports connected, but publishes no tools to the session.**
Observed four times across three sessions, each after a restart: `claude mcp list` reports
`✔ Connected` while `WaitForMcpServers` reports no such server configured and none of the
four mandatory tools are callable. Raised upstream as
[LXAgents-MCP/shared-instruction#92](https://github.com/LXAgents-MCP/shared-instruction/pull/92),
which adds the rule for this state and corrects `auto-activation`'s promise of an
`agents://` fallback the server does not serve.

Until it is resolved, **read the conventions from a clone outside the repository** — this
one was worked from `/tmp/shared-instruction`, never copied in. Do not reconstruct them
from memory, and do not vendor them: `AGENTS.md` forbids both, and the discovery protocol
forbids the first for a specific reason, which is that it is how a whole planning phase
gets quietly invented.

## What exists

* `LICENSE` — MIT, © 2026 LXBrowser (pre-existing).
* `AGENTS.md` — entry point, activation contract, shared instruction tools block.
* `.agents/index/` — seven scope indexes.
* `.agents/rules/repository.md` — project rules.
* `.agents/design/` — the Silver Glass design system, thirteen single-subject files.
* `.agents/wiki/context/repository-map.md` — orientation page.
* `.agents/memory/` — this file and the task records.
* `wiki/` — `information/overview.md`, `environments/setup.md`, `environments/env.md`.
* `manifest.json` — MV3, new-tab override, module service worker, the `storage` permission,
  and four host permissions.
* `src/background.js` — the service worker. Every OpenRouter call, the tool loop, and the
  only place the API key is read.
* `src/tools.js` — the tool schemas, and the two network tools the worker runs.
* `src/prompts/system-instructions.md` — the Main Agent's operating manual, shipped with
  the extension.
* `src/db.js` — IndexedDB wrapper, three object stores, promisified, FK enforced in code.
* `src/ui/app.js` — the wiring. Eight modules under `src/ui/lib/`.
* `src/ui/index.html` + `src/ui/css/` — the three-pane interface and its styles.
* `src/ui/icons/icon-128.png` — generated icon.
* `wiki/logs/0/1/0/CHANGELOG.md` — the only release.

## Stack

Vanilla HTML, CSS, and ES6+ modules. No build step and no dependencies in the shipped tree.
Chrome Manifest V3, full-page new-tab override. IndexedDB for storage. OpenRouter for
models. The one package manager is the browser harness: `tests/e2e/package.json` carries
Playwright as a dev dependency, and nothing under `src/` depends on it.

## What is not built

* **No synthesis.** Sub-agents answer independently and nothing combines them into a
  single response. This was an owner decision for this phase, to keep the token cost and
  the architecture manageable.
* **No tools for sub-agents.** The schemas are declared only on the Main Agent's requests.
* **The system instructions are not editable in the interface.** They are seeded into
  `agent_instructions` and read from there; nothing in the UI writes them yet.
* **No separate sub-agent models.** The Main Agent and every sub-agent use whichever model
  the picker is set to.
* **File attachments are listed, not read.** Files appear in the dropzone; their contents
  are never attached to a message.
* **No cancel or stop.** A request in flight can only be waited out.

## What works today

**The application now runs, and every control in the list below has been exercised in a
real browser.** Getting there took four Chrome runs, each stopped by a different fault,
and none of the three earlier ones could have been found by reading the code: `boot()` was
defined and never called; `manifest.json` declared no `permissions` key, so Chrome never
injected `chrome.storage`; and `el()` in `views.js` threw on its first `dataset` write,
which killed `renderHistory()`, which rejected `boot()` at step 4 — before step 5, where
every listener is attached. That last one presented as six unrelated dead controls and was
invisible to 122 static checks, none of which execute `app.js`.

What the browser harness confirms: boot completes, the gate opens and closes, the model
dropdown populates, history renders with real `data-*` attributes and its rows switch chats,
the title input follows, delete works (for a chat with messages too — until 2026-10-09 it
had only been driven on empty chats), the multi-agent toggle flips, the modal opens and
cancels, Clear empties the textarea, Send enters its busy state and re-enables, and a
dropped file is listed. No page errors.

What it does **not** confirm is anything that needs a billable call — with one exception
now recorded below: the send path has been driven with a stubbed response.

**The centre pane reads top to bottom: model picker, one status row, conversation.** The
status row's text changes in place and is asserted to be the same DOM node before and after
a send, with the pane's element count unchanged. There is no longer an agent log, an agent
dropdown, or a count badge anywhere in the interface.

**The key modal has two states and writes on exactly one of them.** With no key stored the
field is empty and editable and the button is **Save key**; with one stored the field is
`readonly` behind an **Edit** button showing a constant mask, and **Update key** is disabled
until Edit is pressed. Cancel writes nothing. And `storage.getApiKey()` is **deleted**, not
merely unused — the only accessor left returns a boolean — so no code path in the page can
pull the credential in even by accident.

* Load unpacked; the API-key modal blocks until a key is stored. **Confirmed.**
* New chat, open chat, delete chat (including one with messages), rename chat — all against
  IndexedDB. **Confirmed.**
* **Send a prompt and get a streamed answer**, token by token, in the centre pane. The
  prompt and the final answer are both stored in `chat_messages`. **Confirmed against a
  stubbed response** — the worker's `fetch` was replaced with a scripted SSE body, so the
  port, the parser, the delta assembly and the IndexedDB write all ran with no key and no
  billable call. A real OpenRouter stream still has not.
* Choose the model from the dropdown, or type any OpenRouter model id to override it. *The
  dropdown and the hint are confirmed; the effect on a request is not.*
* Toggle multi-agent mode; the limit input enables and validates at ≥ 1. **Confirmed.**
* Send with multi-agent on; **every sub-agent makes a real OpenRouter call**, and the
  running count in the status row **drops the moment it finishes** — as it does for the
  Main Agent. The count is confirmed against the registry; the fan-out is not observed.
* **Ask something the Main Agent cannot answer from memory.** It calls `search_web`,
  follows a result with `read_page`, cites where the facts came from, and renames the chat
  once it knows the subject. The status row names the tool as it runs. *Not observed.*
* **A failed send says why**, under the Send button — a 401 and an empty answer both
  state their reason. **Confirmed against a stubbed 401.** It used to be written to a log
  pane the person sending was not looking at, so every failure presented as a Send that
  did nothing.
* **A worker that dies mid-answer is reconnected and retried once**, with the status row
  showing `Reconnecting…` for the duration so the second billable call is never silent.
  **Confirmed against a real worker kill** — the status row is observed passing through
  `Working… → Reconnecting… → Writing… → Answer ready`, the OpenRouter request is counted
  at exactly two, and the user turn is stored exactly once. A request the worker already
  *answered* is never retried: a 401 makes one request and shows its reason.

## Limits worth knowing

* **This spends real money.** Every prompt is a billable call, multi-agent mode is N+1
  calls per send, and a prompt that uses tools is several calls for the Main Agent alone.
* **A single request is capped at roughly five minutes** by Chrome. A very long answer is
  cut mid-stream and surfaces as an error, not a completion. The tool loop has its own
  bound of six rounds.
* **The service worker is terminated when idle.** A termination mid-stream is now
  retried once, visibly. **A ping keeps the worker warm between sends, but a pending
  `fetch` already holds it alive during a stream** — measured with a 45-second quiet
  stretch and no ping at all, which completed normally. The ping is not what prevents the
  reported error; the reconnect is.
* **`https://*/*` is granted** so `read_page` can follow a search result to any host. It is
  deliberate and it is broad; the guards are in the tool, not the permission. A redirect is
  followed and its landing re-checked, and a refused landing still costs one request. The guard
  resolves DNS over HTTPS and **fails closed**, so a network that blocks
  `cloudflare-dns.com` stops `read_page` working rather than letting it read unchecked.
* **The search parser is the fragile part.** It reads DuckDuckGo's keyless HTML with no API
  contract behind it. If search starts returning nothing, that is where to look.
* **`deepseek/deepseek-v4-flash` is unverified** — used exactly as the owner gave it, and
  not confirmed against OpenRouter's catalogue. A bad id fails loudly at request time.

## What has not been verified

**Anything past the first answer, and the first answer itself against a real key.** The
harness seeds a placeholder key so `boot()` gets past the gate, which is enough to prove the
interface and nothing more. The send path has since been driven with a **stubbed** response,
so the port, the SSE parser, delta assembly, storage and repaint are all exercised — but
against a body this repository wrote, not OpenRouter's. Whether OpenRouter accepts these
requests or these tool schemas, whether the streaming caret behaves over a live stream,
and whether DuckDuckGo still serves markup the parser recognises — all unobserved. The tool
loop has only been driven by scripted SSE bodies. Observed on 2026-10-09: Chrome does **not**
return a readable `Location` for a `redirect: 'manual'` response, so the per-hop redirect
guard could never have worked; `read_page` now follows redirects and checks where they land
(see `wiki/environments/env.md`), driven against a real local server and real redirects.

Every module passes `node --check`, every import and DOM id resolves, no `style` attribute
or style assignment remains anywhere in `src/`, all 47 classes in `index.html` are defined
in the stylesheets, `boot()` resolves to an invocation, no top-level function in `app.js`
is left uncalled, and every `chrome.<api>` used in `src/` has its permission declared or
needs none. **185 checks** run under Node against stubbed `chrome` and `fetch` cover the
service worker's SSE handling and tool loop, the model settings, the port client, the search
parser and HTML extraction, the `read_page` guard, the page half of a tool round-trip, the
agent registry, the manifest's permissions, the `data-*` names `views.js` writes against the
selectors `app.js` uses, the centre pane's structure, the single status row, a failed send
reaching the composer, the key modal's state machine, and the boot step labels against the
file's own load-order list.

**The static suite still cannot execute `app.js`, and that cost three rounds.** A fully
written, correct, entirely unreachable `boot()` passed every check in two consecutive
rounds. A manifest with no `permissions` key passed them again. A helper that threw on its
first element in a strict-mode module passed them a third time. The uncalled-function
assertion, the permission sweep and the dataset sweep close those three holes and nothing
else — all three are one-shot checks against faults already fixed, not standing guards, and
none of them is a substitute for running the thing.

Two layout cases are also still unobserved: the right pane below its 140px composer floor,
and the layout under 900px, where the responsive rules give `.pane` a `min-height: 260px`
and the composer asks for more than half of it.

The procedure is in `wiki/environments/setup.md`. Its step 1 has been driven; steps 2–12
need a real key and have never been run by anyone, so expect to find things that are not
in the list.

The test scripts live in `tests/e2e/` and are **committed** as of the branch that moved them
there. They used to sit in `/tmp`, untracked, because `.agents/rules/repository.md` then
forbade a `package.json` anywhere in the repository — a rule now scoped to the shipped
tree, since Playwright is a dependency of the harness and not of the extension.

**Since the sixth run there is a browser harness that can execute the extension**, which
the static suite never could. Playwright loads the unpacked extension into a real Chromium
with the full build rather than `chrome-headless-shell` — the shell cannot load an
extension at all. OpenRouter is stubbed with `context.route` at the browser-context level,
**not** by patching `fetch` inside the worker: a worker-side patch dies the moment Chrome
recycles the worker, and every test in that suite is about a worker that gets recycled.
It lives at `tests/e2e/`, with its `package.json` and `node_modules` kept inside that
directory rather than at the repository root, so the tree Chrome loads unpacked is still
exactly what ships. Run `npm test` there.

## Known open items

**Nothing stops a `style="…"` from coming back.** `manifest.json`'s `style-src 'self'` will
refuse it in the browser, which is the guard, but there is no lint step and no test runner
in this repository, so the earliest that pattern is caught is a console error on a new tab.
The rule worth writing is a discovery finding, not code.

**The same is true of a manifest that drifts from the code.** The missing `permissions` key
sat behind two full rounds of green checks because nothing in this repository reads the
manifest from the code side. The permission sweep closes the specific case, and
`startupFault()` now turns a repeat into a message that names the fault rather than a bare
`TypeError` — but a *new* API used with no permission would still be caught first by
Chrome, not by anything here.

**`deepseek/deepseek-v4-flash` is unverified.** It is in the model picker exactly as the
owner wrote it and has not been checked against OpenRouter's catalogue. If the id is wrong,
the failure is loud and specific — the picker still offers the default and a custom field,
so nothing is a dead end.

Minor divergence from the shared convention: `plan_creator` specifies `/.agents/plans/`
with a leading slash; the `.gitignore` uses `.agents/plans/`. Functionally equivalent here,
since there is one such folder. **The folder itself is untracked and excluded by
`.gitignore`** — confirmed with `git check-ignore` before anything was written into it. An
earlier version of this file claimed the opposite.

## Next obvious step

**Reload the extension and walk the checklist in `wiki/environments/setup.md`.** Not
synthesis — synthesis is still the largest thing the product description promises that the
extension does not do, and it is still an owner decision. But it is not the next step,
because nothing has been *observed working*.

Adding the `storage` permission unblocks everything that was waiting behind it, so this is
the run in which the application executes properly for the first time: the gate, the model
picker, Settings, the port, the service worker, the tool loop and `read_page`. **Chrome
re-prompts for the new permission**, and the page must be a *new* tab — reloading the
extension card does not re-fetch anything for a new-tab page that is already open. Expect
further defects; that is where the next ones will be.
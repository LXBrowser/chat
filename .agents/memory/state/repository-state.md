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

Vanilla HTML, CSS, and ES6+ modules. No package manager, no build step, no dependencies.
Chrome Manifest V3, full-page new-tab override. IndexedDB for storage. OpenRouter for
models.

## What is not built

* **No synthesis.** Sub-agents answer independently and are logged in the centre pane;
  nothing combines them into a single response. This was an owner decision for this phase,
  to keep the token cost and the architecture manageable.
* **No tools for sub-agents.** The schemas are declared only on the Main Agent's requests.
* **The system instructions are not editable in the interface.** They are seeded into
  `agent_instructions` and read from there; nothing in the UI writes them yet.
* **No separate sub-agent models.** The Main Agent and every sub-agent use whichever model
  the picker is set to.
* **File attachments are listed, not read.** Files appear in the dropzone; their contents
  are never attached to a message.
* **No cancel or stop.** A request in flight can only be waited out.

## What works today

**Nothing on this list has ever run to completion.** Two faults stood between the
application and its first live execution, and each one had to be found by opening Chrome:
`boot()` was defined and never called, and then `manifest.json` declared no `permissions`
key at all, so in Manifest V3 Chrome never injected `chrome.storage` and every call through
it threw. The third Chrome run is the first in which any application code ran at all, and
it died at step 1 of `boot()` with a `TypeError`. Both are fixed. The correct claim is that
the code paths exist, not that they work — nothing here has been observed doing any of it.

* Load unpacked; the API-key modal blocks until a key is stored.
* New chat, open chat, delete chat, rename chat — all against IndexedDB.
* **Send a prompt and get a streamed answer**, token by token, in the left pane. The
  prompt and the final answer are both stored in `chat_messages`.
* Choose the model from the dropdown, or type any OpenRouter model id to override it.
* Toggle multi-agent mode; the limit input enables and validates at ≥ 1.
* Send with multi-agent on; **every sub-agent makes a real OpenRouter call**, logs its
  result in the centre pane, and leaves the dropdown when it finishes — as does the Main
  Agent.
* **Ask something the Main Agent cannot answer from memory.** It calls `search_web`,
  follows a result with `read_page`, cites where the facts came from, and renames the chat
  once it knows the subject. Tool calls log in the centre pane as they run.

What *is* confirmed in Chrome is presentation only: the panes render under the extension's
own CSP, the composer takes the remaining height, the footer is not overlapped, and the
label is clear of the textarea.

## Limits worth knowing

* **This spends real money.** Every prompt is a billable call, multi-agent mode is N+1
  calls per send, and a prompt that uses tools is several calls for the Main Agent alone.
* **A single request is capped at roughly five minutes** by Chrome. A very long answer is
  cut mid-stream and surfaces as an error, not a completion. The tool loop has its own
  bound of six rounds.
* **The service worker is terminated when idle.** A termination mid-stream loses that
  request; the port reconnects on the next send.
* **`https://*/*` is granted** so `read_page` can follow a search result to any host. It is
  deliberate and it is broad; the guards are in the tool, not the permission. The guard
  resolves DNS over HTTPS and **fails closed**, so a network that blocks
  `cloudflare-dns.com` stops `read_page` working rather than letting it read unchecked.
* **The search parser is the fragile part.** It reads DuckDuckGo's keyless HTML with no API
  contract behind it. If search starts returning nothing, that is where to look.
* **`deepseek/deepseek-v4-flash` is unverified** — used exactly as the owner gave it, and
  not confirmed against OpenRouter's catalogue. A bad id fails loudly at request time.

## What has not been verified

**The extension has been loaded in Chrome three times, and no run has exercised a line of
application behaviour to completion.** The first reported the CSP violation and the
right-pane overlap. The second reported the composer label sitting on the textarea and the
API-key modal never appearing — because `boot()` was defined and never called. The third
was the first live execution of anything in `app.js`, and it rejected at step 1: the
manifest declared no `permissions`, so `chrome.storage` was `undefined` and every call
through it threw. Both are fixed and neither fix has been observed running.

Every module passes `node --check`, every import and DOM id resolves, no `style` attribute
or style assignment remains anywhere in `src/`, all 47 classes in `index.html` are defined
in the stylesheets, `boot()` resolves to an invocation, no top-level function in `app.js`
is left uncalled, and every `chrome.<api>` used in `src/` has its permission declared or
needs none. 105 checks run under Node against stubbed `chrome` and `fetch` cover the service
worker's SSE handling and tool loop, the model settings, the port client, the search parser
and HTML extraction, the `read_page` guard, the page half of a tool round-trip, the agent
registry, and the manifest's permissions.

**None of those checks executes `app.js`, and there is no DOM harness that could.** That
is how a fully written, correct, entirely unreachable `boot()` passed every check in two
consecutive rounds, and how a manifest with no `permissions` key passed them again. The
uncalled-function assertion and the permission sweep close those two holes and nothing
else — both are one-shot checks against a fault that has already been fixed, not a
standing guard.

Confirmed in Chrome is presentation only: the panes render under the extension's own CSP,
the composer takes the remaining height, and the footer is not overlapped.

Unverified is everything else — whether it boots past the gate at all, whether OpenRouter
accepts these requests or these tool schemas, whether the streaming caret behaves over a
live stream, whether DuckDuckGo still serves markup the parser recognises, and whether
Chrome returns a readable `Location` for a `redirect: 'manual'` response, which the
redirect guard depends on. The tool loop has only been driven by scripted SSE bodies.

Two layout cases are also still unobserved: the right pane below its 140px composer floor,
and the layout under 900px, where the responsive rules give `.pane` a `min-height: 260px`
and the composer asks for more than half of it.

The procedure is in `wiki/environments/setup.md`. That checklist has never been run to the
end — it was written before the first Chrome run, against an application that turned out
never to have booted — so expect to find things that are not in it.

The test scripts live in `/tmp` and are **not committed** — the repository states it has no
test runner, and adding one was out of scope. They are the obvious first candidate if that
changes.

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
since there is one such folder. That file **is** committed.

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
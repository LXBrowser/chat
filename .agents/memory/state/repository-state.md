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
* `manifest.json` — MV3, new-tab override, module service worker, four host permissions.
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

**Intended, and not yet confirmed in a browser** — see *What has not been verified* below.
These were verified under Node against stubs, which is not the same claim.

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

**The extension has been loaded in Chrome once — and that run failed immediately.** The
owner loaded it unpacked and the new tab reported a Content Security Policy violation:
`manifest.json`'s `style-src 'self'` forbids the ten `style="…"` attributes in
`src/ui/index.html`, so the page's own styles were never applied. The same run showed the
right pane overlapping its footer, for the reason recorded in task 7. **Both were open at
the time this was written** and are the whole of task 7.

Every module passes `node --check`, every import and DOM id resolves, and 102 checks run
under Node against stubbed `chrome` and `fetch` cover the service worker's SSE handling and
tool loop, the model settings, the port client, the search parser and HTML extraction, the
`read_page` guard, the page half of a tool round-trip, and the agent registry.

Because the CSP error stopped the styles applying, **no one has yet seen the interface
render as intended**, and the real network round-trip is still untested: `app.js` boot
order, the modal, the panes rendering, the streaming caret, whether OpenRouter accepts these
requests or these tool schemas at all, whether DuckDuckGo still serves markup the parser
recognises, and whether Chrome returns a readable `Location` for a `redirect: 'manual'`
response — which the redirect guard depends on. The tool loop has only been driven by
scripted SSE bodies.

The procedure is in `wiki/environments/setup.md`: load unpacked, walk the working list
above, then run the `db.js` round-trip and its two negative paths from the console.

The test scripts live in `/tmp` and are **not committed** — the repository states it has no
test runner, and adding one was out of scope. They are the obvious first candidate if that
changes.

## Known open items

**Two presentation defects from the first browser run, both in task 7:** the CSP violation
above, and the right pane overlapping its Send/Clear footer. Nothing outside `src/ui/` is
involved.

**Nothing stops a `style="…"` from coming back.** `manifest.json`'s `style-src 'self'` will
refuse it in the browser, which is the guard, but there is no lint step and no test runner
in this repository, so the earliest that pattern is caught is a console error on a new tab.
The rule worth writing is a discovery finding, not code.

**`deepseek/deepseek-v4-flash` is unverified.** It is in the model picker exactly as the
owner wrote it and has not been checked against OpenRouter's catalogue. If the id is wrong,
the failure is loud and specific — the picker still offers the default and a custom field,
so nothing is a dead end.

Minor divergence from the shared convention: `plan_creator` specifies `/.agents/plans/`
with a leading slash; the `.gitignore` uses `.agents/plans/`. Functionally equivalent here,
since there is one such folder. That file **is** committed.

## Next obvious step

Synthesis. Sub-agents answer independently and are logged; nothing merges them into one
response, which is the largest thing the product description promises that the extension
does not yet do. It is also the most expensive thing to build and to run, so it is an owner
decision rather than an obvious one.
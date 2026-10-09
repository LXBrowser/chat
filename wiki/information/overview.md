# Overview

`@lxbrowser/chat` is a Multi-Agent Chat **Chrome extension**. It replaces your new tab
with a three-pane workspace where a main agent can delegate work to sub-agents, call a
built-in search-and-read tool, and keep every conversation in local storage.

- **Version** `0.1.0`
- **License** MIT — see [LICENSE](../../LICENSE)
- **Repository** <https://github.com/LXBrowser/chat>

## What it does

* **Three floating panes.** Chat history on the left, the conversation in the centre, and
  your prompt, attachments, and controls on the right. Each pane scrolls independently.
  The centre pane reads top to bottom: the model picker, a single live status row, and the
  conversation stream.
* **One status row, not a log.** A single line above the conversation reports what the
  agents are doing — `Working…`, `Searching…`, `Writing…`, `Answer ready` — and its text
  changes in place. It never grows a line, so there is no scrollback to read and no rows
  to scroll past.
* **Multi-agent mode.** A toggle turns delegation on, and a count sets how many sub-agents
  may run at once. The number currently running rides in the status row itself.
* **Local storage.** Conversations live in IndexedDB in your browser. Nothing leaves the
  machine except the prompts you send and the pages the search tool fetches.
* **Search and read.** The main agent can search the web and pull the readable text off a
  result page, and it renames the chat once it knows what the conversation is about.
* **A system prompt you can read.** The Main Agent's operating manual ships in the bundle
  and is stored in `agent_instructions` on first run.

## Stack

| | |
|---|---|
| Platform | Chrome, Manifest V3 |
| Surface | Full page — overrides the new tab |
| Language | Vanilla HTML, CSS, JavaScript (ES6+ modules) |
| Dependencies | None. No framework, no bundler, no CDN. |
| Storage | IndexedDB — `chat_sessions`, `chat_messages`, `agent_instructions` |
| Models | OpenRouter |

## Current state

`0.1.0` is written to chat for real, and every item below is implemented. **The interface
and the send path are confirmed working in a browser; nothing past the first answer has
been seen.** Four Chrome runs have each been stopped by a different fault — a
content-security violation, a `boot()` that was never called, a manifest with no
`permissions` at all, and a DOM helper that threw before any listener was attached — and all
four are fixed. The last of those presented as six unrelated dead controls, which is the
shape a single early fault takes when it stops the page from wiring anything.

The extension is now driven in Chromium: boot completes, the modal works, chats can be
started, opened, renamed and deleted, the model and multi-agent controls respond, and Send
streams an answer word by word into the transcript, saves both sides to the chat, and
re-enables. That send was confirmed against a **stubbed** response, not a real one — the
service worker's `fetch` was replaced with a scripted body so the port, the SSE parser, the
delta assembly and the IndexedDB write all ran with no key and no billable call. What a real
key has still never exercised is everything downstream of the first answer:

* load it unpacked; an API-key modal blocks the app until a key is stored — **confirmed**
* start, open, rename, and delete chats — all stored locally in IndexedDB — **confirmed**,
  including deleting a chat that has messages (checked in a browser on 2026-10-09; before
  that only empty chats had been deleted)
* **send a prompt and watch the answer arrive word by word**; the prompt and the answer are
  both saved to the chat — *confirmed against a stubbed response, never a real one*
* pick a model from the dropdown, or type any OpenRouter model id to override it — *the
  control is confirmed, its effect on a request is not*
* switch multi-agent mode on, set a cap, and send — every sub-agent makes its own request,
  and the running count in the status row **drops the moment it finishes** — *the toggle is
  confirmed, the fan-out is not*
* **ask something the model cannot answer from memory** and it will search, read a result,
  and say where the facts came from. The status row names the tool as it runs.
* **have the chat rename itself** once the main agent knows what the conversation is about

A failed send now says why, under the Send button. It used to be written to a log pane
nobody was looking at, so a bad key, a declined card, an empty answer and a dead worker all
presented as a Send that did nothing.

That caveat is not caution for its own sake. `boot()` was found defined and never called,
so the entire application sat inert behind a correct-looking interface until the second
Chrome run, and 122 static checks passed over all three of the early faults because none of
them executes `app.js`. Walk the checklist in [Setup](../environments/setup.md) before
relying on any of it — expect that first run with a real key to surface further defects,
because the tool loop, sub-agent fan-out and the `read_page` guard have still never seen a
live request.

What does not exist yet:

* **no synthesis** — sub-agents answer independently and nothing merges them into one
  response
* **tools are for the main agent only** — sub-agents answer from what they were given and
  cannot search
* **no cancel** — a request in flight can only be waited out
* **the search parser reads third-party HTML** — it has no API contract behind it and is
  the most likely thing to break; see [Environment](../environments/env.md)
* **file attachments are listed, not read** — files appear in the dropzone but are never
  attached to a message

## Cost

Every prompt is a billable OpenRouter call, and multi-agent mode is one call for the main
agent plus one per sub-agent. A prompt that uses tools is several calls for the main agent
alone — one per round. Point it at a cheap model while you are trying things.

## Next steps

1. Load the extension unpacked — see [Setup](../environments/setup.md).
2. Walk the checklist there to confirm it behaves before anything is built on top of it.
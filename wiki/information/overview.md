# Overview

`@lxbrowser/chat` is a Multi-Agent Chat **Chrome extension**. It replaces your new tab
with a three-pane workspace where a main agent can delegate work to sub-agents, call a
built-in search-and-read tool, and keep every conversation in local storage.

- **Version** `0.1.0`
- **License** MIT — see [LICENSE](../../LICENSE)
- **Repository** <https://github.com/LXBrowser/chat>

## What it does

* **Three floating panes.** Chat history and the synthesized response on the left, live
  agent status and logs in the centre, and your prompt, attachments, and controls on the
  right. Each pane scrolls independently.
* **Multi-agent mode.** A toggle turns delegation on, and a count sets how many sub-agents
  may run at once. Agents appear in the centre dropdown while they work and leave it when
  they finish.
* **Local storage.** Conversations live in IndexedDB in your browser. Nothing leaves the
  machine except the prompts you send and the pages the search tool fetches.
* **Search and read.** The main agent can search the web and pull the readable text off a
  result page.

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

`0.1.0` has a **working interface over no model**. What you can do today:

* load it unpacked; an API-key modal blocks the app until a key is stored
* start, open, rename, and delete chats — all stored locally in IndexedDB
* send a prompt; it is recorded and the transcript updates
* switch multi-agent mode on, set a cap, and send — sub-agents appear in the centre
  dropdown, log as they work, and **leave the list the moment they finish**

What does not exist yet:

* **no OpenRouter client** — the key is stored, but nothing calls the API, so a sent
  prompt is never answered
* **no real sub-agents** — they run on a timer through canned steps
* **no search tool** and no background fetcher
* **file attachments are listed, not read** — files appear in the dropzone but are never
  attached to a message

## Next steps

1. Load the extension unpacked — see [Setup](../environments/setup.md).
2. Walk the checklist there to confirm the interface behaves before any of the above is
   built on top of it.
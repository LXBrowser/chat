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

`0.1.0` is a **shell**. What exists:

* the MV3 manifest and the three-pane interface
* the design system that governs how it looks, under `.agents/design/`
* the IndexedDB layer, verified by direct console calls

What does not exist yet, and is the subject of the next work:

* the OpenRouter client and the API-key flow
* agent orchestration — spawning, monitoring, and synthesis
* the background fetcher behind the search tool
* file import and drag-and-drop wiring

The buttons, dropdowns, and inputs for all of these are on the page already. They do not
do anything yet.

## Next steps

1. Load the extension unpacked — see [Setup](../environments/setup.md).
2. Point it at an OpenRouter key — see [Environment](../environments/env.md).
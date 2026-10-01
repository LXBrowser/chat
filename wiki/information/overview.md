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

`0.1.0` chats for real. What you can do today:

* load it unpacked; an API-key modal blocks the app until a key is stored
* start, open, rename, and delete chats — all stored locally in IndexedDB
* **send a prompt and watch the answer arrive word by word**; the prompt and the answer are
  both saved to the chat
* pick a model from the dropdown, or type any OpenRouter model id to override it
* switch multi-agent mode on, set a cap, and send — every sub-agent makes its own request,
  logs its answer in the centre pane, and **leaves the list the moment it finishes**

What does not exist yet:

* **no synthesis** — sub-agents answer independently and are logged; nothing merges them
  into one response
* **no search tool** — neither agent can fetch anything
* **no cancel** — a request in flight can only be waited out
* **file attachments are listed, not read** — files appear in the dropzone but are never
  attached to a message

## Cost

Every prompt is a billable OpenRouter call, and multi-agent mode is one call for the main
agent plus one per sub-agent. Point it at a cheap model while you are trying things.

## Next steps

1. Load the extension unpacked — see [Setup](../environments/setup.md).
2. Walk the checklist there to confirm it behaves before anything is built on top of it.
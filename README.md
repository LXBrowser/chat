# @lxbrowser/chat

A Multi-Agent Chat **Chrome extension**. It replaces your new tab with a three-pane
workspace where a main agent answers you, can fan a prompt out to sub-agents, calls a
built-in search-and-read tool, and keeps every conversation in local storage.

- **Version** `0.1.0` — it chats: prompts go to OpenRouter and answers stream back. What has
  and has not been checked is in the [Overview](wiki/information/overview.md)
- **License** MIT © 2026 LXBrowser — [LICENSE](LICENSE)
- **Stack** Chrome Manifest V3 · vanilla HTML/CSS/ES6+ modules · IndexedDB · OpenRouter
- **Dependencies** none — no framework, no bundler, no CDN

## Features

* **Three floating panes** — your chats on the left; the model picker, one status line and
  the conversation in the centre; your prompt, title, files and controls on the right. Each
  scrolls independently.
* **Multi-agent mode** — a toggle turns sub-agents on and a count bounds them. Each makes its
  own OpenRouter call, and the status line shows how many are running. Their answers are not
  merged or shown yet.
* **Local-first storage** — conversations live in IndexedDB in your browser.
* **Search and read** — the main agent searches the web and pulls readable text off a page.
* **Instructions that ship with it** — the main agent's system prompt is
  `src/prompts/system-instructions.md`, seeded into IndexedDB on first run.

## Quick start

```bash
git clone https://github.com/LXBrowser/chat
cd chat
```

Then load it: `chrome://extensions` → Developer mode → **Load unpacked** → select this
directory. Open a new tab. Full walkthrough in
[Setup](wiki/environments/setup.md).

Verify the database layer from the new-tab console:

```js
const db = await import('../db.js');   // from the new-tab page, db.js is one level up
const s = await db.createSession();
await db.addMessage(s.id, 'user', 'hello');
await db.listMessages(s.id);
```

## Documentation

Start with these:

* [Overview](wiki/information/overview.md) — what it is, what works today, what does not
* [Setup](wiki/environments/setup.md) — load it unpacked and verify it
* [Environment](wiki/environments/env.md) — the OpenRouter key, models, permissions

The full map is [`.agents/index/project-wiki-index.md`](.agents/index/project-wiki-index.md).

## Working with agents

[`AGENTS.md`](AGENTS.md) is the entry point for anything an agent does in this
repository — the activation contract, the permission gates, and the shared instruction
tools it declares.

The shared instruction set is resolved through the **`lxagents-shared-instruction`** MCP
connector and is not vendored here. Start at `AGENTS.md`, then
[`.agents/index/root-index.md`](.agents/index/root-index.md).

The visual language is the Silver Glass design system, one subject per file under
`.agents/design/`, routed from
[`.agents/index/design-index.md`](.agents/index/design-index.md).
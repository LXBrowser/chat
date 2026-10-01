# @lxbrowser/chat

A Multi-Agent Chat **Chrome extension**. It replaces your new tab with a three-pane
workspace where a main agent delegates to sub-agents, calls a built-in search-and-read
tool, and keeps every conversation in local storage.

- **Version** `0.1.0` — a shell: manifest, database layer, and interface
- **License** MIT © 2026 LXBrowser — [LICENSE](LICENSE)
- **Stack** Chrome Manifest V3 · vanilla HTML/CSS/ES6+ modules · IndexedDB · OpenRouter
- **Dependencies** none — no framework, no bundler, no CDN

## Features

* **Three floating panes** — chat history and the synthesized response, live agent status
  and logs, and your prompt and controls. Each scrolls independently.
* **Multi-agent mode** — a toggle turns delegation on, a count bounds it, and agents leave
  the status dropdown as soon as they finish.
* **Local-first storage** — conversations live in IndexedDB in your browser.
* **Search and read** — the main agent searches the web and pulls readable text off a page.
* **Your own instructions** — an `AGENTS.md` becomes the agents' system prompt.

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
const db = await import('./db.js');
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
[`.agents/index/root-index.md`](.agents/index/root-index.md).
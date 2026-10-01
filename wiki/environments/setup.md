# Setup

There is nothing to install and nothing to build. The repository is loaded unpacked.

## Requirements

* Google Chrome, or a Chromium browser that supports Manifest V3.
* Roughly 40 MB of free disk — Chrome keeps the unpacked directory.

## Load the extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the **repository root** — the directory containing `manifest.json`, not `src/`.
5. Confirm the extension appears in the list as `@lxbrowser/chat` with no errors.

## Open it

Open a **new tab**. The extension overrides the new tab page, so the three panes load in
place of the usual Chrome start page.

To get the old new tab back, disable the extension at `chrome://extensions`, or press
`Alt`+`Ctrl`+`N` for a plain new window.

## Why `file://` will not work

Opening `src/ui/index.html` directly from disk fails, and the console will say so. ES
modules and IndexedDB both require a real origin, and `file://` is not one. Always go
through **Load unpacked** and the new-tab override.

## After changing files

Chrome does not reload unpacked extensions automatically. Press the reload icon on the
extension card at `chrome://extensions` after every change, then reopen the new tab.

## Verifying the database layer

With the new-tab page open, open the DevTools console and run:

```js
const db = await import('../db.js');   // db.js is one directory up, from src/ui/
const s = await db.createSession();
await db.addMessage(s.id, 'user', 'hello');
await db.listMessages(s.id);   // one row, message_index 0
await db.listSessions();       // contains s
await db.setTitle(s.id, 'Renamed');   // survives a reload
```

The negative paths should reject rather than silently corrupt:

```js
await db.addMessage('no-such-session', 'user', 'x');   // rejects
await db.saveInstruction('Bad_ID', 'x');               // rejects on the id rule
```

`await` at the top level needs the console in module-await mode, which DevTools has
enabled by default. If it complains, wrap the block in an async IIFE.

## Getting the API key

See [Environment](env.md).
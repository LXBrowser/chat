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

## Checking the interface

The extension has never been run in CI, so this is a manual pass. Work down it.

1. **Load unpacked.** Open a new tab. A modal blocks the app asking for an OpenRouter
   key — nothing else is usable until you provide one.
2. **Send something.** Type a prompt, press **Send**. It appears in the left pane, and the
   chat is titled from the first line rather than staying "New Chat".
3. **Turn multi-agent on.** The pill goes from red **OFF** to green **ON**, and the max
   agents field becomes editable. Clear it and press Tab — it should snap to `1`, not stay
   empty.
4. **Send again with the cap at 3.** Three agents appear in the centre dropdown, log as
   they work, and **each disappears as it finishes**. Watch one: when the one you have
   selected finishes, the pane should fall back to another running agent rather than going
   blank.
5. **Rename the chat.** Edit the title field; "Saved" flashes and the history list updates.
6. **New chat, then switch between them.** Reload the page — the chats are still there.
7. **Drop a file on the dropzone.** It is listed. It is *not* attached to anything yet.

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
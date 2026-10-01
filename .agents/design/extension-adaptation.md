---
name: design-extension-adaptation
description: How the Silver Glass design system maps onto the MV3 extension UI — which rules carry over unchanged, which are lifted, and which the extension adds.
---

# Adapting Silver Glass to the extension

The extension is the system's first consumer inside a product rather than a docs site.
This file records how each part of the system maps onto it, so the mapping is a decision
rather than something the next person re-derives.

## What carries over unchanged

| Design system rule | In the extension |
|---|---|
| [`principles.md`](principles.md) §1 self-contained | Loads nothing from a CDN. No webfont. The manifest forbids remote code outright. |
| [`principles.md`](principles.md) §2 token-driven | `src/ui/css/tokens.css` is the only file holding a colour value. |
| [`principles.md`](principles.md) §4 accessible | Native elements, `:focus-visible` from the token layer, responsive to ~360px. |
| [`tokens-palette.md`](tokens-palette.md) | Lifted **verbatim** into `tokens.css`. No renaming. |
| [`tokens-glass.md`](tokens-glass.md) | Lifted **verbatim**. |
| [`tokens-geometry.md`](tokens-geometry.md) | Lifted **verbatim**, including the fixed backdrop. |
| [`glass-surface-recipe.md`](glass-surface-recipe.md) | All three panes are raised surfaces and use the recipe as-is. |
| [`components.md`](components.md) | `.btn`, `.badge`, `.chip`, `.callout`, `.panel` are used as named. |

## What the extension changes

**The backdrop is full-bleed and permanent.** There is no scrolling document. The three
panes are fixed to the viewport and each scrolls inside itself, so the fixed silver
gradient is always visible behind all of them. `--maxw` and `.container` do not apply —
a full-viewport app grid has no content column.

**No header or footer chrome.** The extension has one page and no shared navigation, so
[`runtime-includes.md`](runtime-includes.md) does not apply: `src/ui/index.html` inlines
its chrome and does not load `js/site.js` or the partials. Re-introducing them would add a
`fetch()` to a page that needs none.

**Dark `pre` for logs.** The agent-status log stream uses the dark code treatment from
[`components.md`](components.md) rather than glass, because a log is read in long vertical
runs and dark-on-dark is easier to scan than ink-on-silver.

## The rule the extension depends on most

[`overlay-opacity.md`](overlay-opacity.md) is binding here, on two surfaces:

| Surface | Why it qualifies |
|---|---|
| **The agent-status dropdown** | Sits over the message list. Selecting an agent must not show the text behind it. |
| **The OpenRouter key modal** | Covers the entire interface and is modal — nothing behind it may be readable. |

Both use `--surface-solid` with `backdrop-filter: none`. Neither uses the glass recipe.

This is the rule a future agent will get wrong first: a dropdown in a glass interface looks
like it should be glass, and it must not be. The glass recipe is for surfaces over the
**fixed backdrop**. A dropdown is over content.

## The multi-agent toggle

Red OFF, Green ON. These are `--sponsor` and `--success` from the intent palette — not new
colours, and not a new token. State is conveyed by colour **and** by the `aria-pressed`
attribute, because colour alone fails the contrast requirement for non-visual users.

## What is not yet decided

* **Message rendering.** The response stream's markdown treatment is unspecified until the
  rendering code is written. The `.callout` and `pre` treatments will carry most of it.
* **Compact density.** The pane grid is dense for a product UI. `--radius-sm` and tighter
  padding may be needed; if so, add a density token rather than overriding radii ad hoc.
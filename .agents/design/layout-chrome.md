---
name: design-layout-chrome
description: Container widths, the sticky header and footer, and the responsive rules that keep the page from scrolling horizontally.
---

# Layout and chrome

## Container

`.container` — max `--maxw`, centred. Add `.narrow` (max 880px) for text-heavy reading
pages. Every piece of page content goes inside a container; the exception is a full-bleed
backdrop or background section.

## Header

Sticky glass bar: `.site-header` > `.nav`, containing

* `.nav__brand` — the wordmark or home link
* `.nav__links` — a list of `.nav__link`, with `.is-active` on the current page
* `.nav__dd` — an optional dropdown
* `.nav__toggle` — the mobile menu button
* `.nav__spacer` — an item that pushes the final link, such as a call-to-action, to the
  far right

The header uses `--glass-strong`, not `--glass`. It is sticky, it overlaps scrolling
content, and it must stay readable when the blur is unavailable.

## Footer

`.site-footer`, with a brand column and one or more link columns.

## Responsive

**Below 900px** the nav collapses into a toggled panel. That panel is a content-covering
overlay and is therefore **opaque** — see [`overlay-opacity.md`](overlay-opacity.md).

Grids use `auto-fit` / `auto-fill` with `minmax()` so they reflow without a media query
per breakpoint.

## The no-horizontal-scroll rule

**The page body never scrolls horizontally.** Wide content scrolls inside its own
container — a `.table-wrap` around a table, an overflow pane around code.

This is the rule most often broken by a wide table added late, and the symptom is a
horizontal scrollbar on the whole document that makes every other component feel wrong.
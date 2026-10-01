---
name: design-accessibility
description: The Silver Glass accessibility checklist — landmarks, heading order, focus, contrast, and keyboard operation.
---

# Accessibility checklist

Work through this before a page ships. Most of it is handled by the components; the point
is to catch the places a page used them in a new way.

## Structure

* Semantic landmarks: `<header>`, `<nav>`, `<main>`, `<footer>`.
* **One `<h1>` per page**, and no heading level skipped on the way down.
* `aria-label` on the nav and breadcrumb regions — two `<nav>` elements on one page are
  indistinguishable to a screen reader without it.
* Decorative icons carry `aria-hidden="true"`.

## Focus

* A visible `:focus-visible` outline is provided in `main.css`. Do not remove it, and do
  not replace it with `outline: none` without an equally visible replacement.
* Anything operable by pointer is operable by keyboard. The accordion is native
  `<details>`; the dropdown opens on `:focus-within`; the mobile menu is a real `<button>`.

## Contrast

Body ink on glass over the silver field meets WCAG AA.

**The exception to check:** body text placed directly on `--glass-faint` has not been
verified. `--glass-faint` is `rgba(255,255,255,.40)` — a faint inset block, not a reading
surface. Check it before putting body copy there.

Muted captions on `--ink-400` are the other common failure. They pass as small text only
against `--white` and `--silver-050`, not against `--glass`.

## Motion

Transitions are `.15s`–`.2s`. Nothing animates on load, and there is no parallax — the
backdrop is `background-attachment: fixed`, which moves with the scroll, not with time.

## The one to keep not forgetting

Any overlay that covers page content is **opaque**. A translucent modal is not only a
contrast question — nested inside another blurred surface, its background can be
suppressed entirely, leaving the content behind visible through it. See
[`overlay-opacity.md`](overlay-opacity.md).
---
name: design-overlay-opacity
description: The rule that overlays covering page content must be opaque and must not rely on backdrop-filter — the most-missed rule in the design system.
---

# Overlays that cover content

**The rule:** any overlay that *fully covers page content* uses an **opaque** background and
**must not** rely on `backdrop-filter` for legibility.

```css
/* content-covering overlay */
background: #ffffff;              /* or var(--surface-solid) */
-webkit-backdrop-filter: none;
backdrop-filter: none;
box-shadow: var(--shadow-md);
```

## Which overlays this covers

Anything that hides what is behind it:

* the mobile navigation panel
* dropdown menus
* modals and dialogs
* the agent-status dropdown in this extension
* the OpenRouter key modal in this extension

## Why, exactly

The glass recipe is for surfaces sitting over the **fixed background**. It is not for
surfaces sitting over other page content.

When such an overlay is nested inside another element that already has `backdrop-filter` —
a blurred sticky header, for example — the child's background paint can be **suppressed**
in browsers and environments where `backdrop-filter` is unsupported or disabled. The
result is the content behind bleeding straight through the overlay that exists to hide it.

The generalisation: **a translucent surface nested inside another translucent surface can
lose its own background.** One level is fine, because the backdrop is the fixed gradient.
Two is not.

And the practical argument, which settles it on its own: a blur over content you are
already hiding adds nothing. It costs a compositing pass and it risks the failure above.
There is no version of this where glass is the better choice.

## `--surface-solid` over `#ffffff`

For an overlay that may need to sit over an image or a saturated accent, prefer
`var(--surface-solid)` — it is `rgba(255,255,255,.98)`, effectively opaque, and it keeps
the tier token in play. Plain `#ffffff` is acceptable and is what the docs site uses.

## Not every overlay qualifies

A dropdown that sits in **empty space** — over the backdrop, not over text — is not a
content-covering overlay, and may be glass. The test is not "is it an overlay", it is
"does it cover content it is hiding".
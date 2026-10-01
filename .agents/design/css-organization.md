---
name: design-css-organization
description: How Silver Glass CSS files are laid out and loaded — root tokens, shared layers, per-section overrides, in a fixed order.
---

# CSS file organization

```
css/
  main.css                 # :root tokens + base element styles
  shared/
    layout.css             # header, nav, footer, breadcrumbs
    components.css         # cards, accordions, tables, badges, buttons, callouts
  <section>/
    <section>.css          # page-specific layout only
```

## Load order

A page links, in this order and no other:

```
main.css  →  shared/layout.css  →  shared/components.css  →  <section>/<section>.css
```

Order is the layering. `main.css` defines the tokens everything else consumes;
`layout.css` sets the frame; `components.css` fills it; the section file is last and can
therefore override without specificity hacks.

## Rules per file

**`main.css`** — `:root` tokens and base element styles. **Nothing else.** A colour
belongs here or in a token file, not in a component.

**`shared/layout.css`** — the page frame. Header, nav, footer, breadcrumbs, container.

**`shared/components.css`** — the table in [`components.md`](components.md). One block per
component, named by its class.

**`<section>/<section>.css`** — layouts no component expresses. This is the *only* place a
page-specific rule belongs, and it composes components rather than redefining them.

## Sizing

Do not hard-code pixel values where a token exists. Spacing, radii, shadows, and colours
all come from `main.css`. A value that appears twice is a token that was not declared.

## Naming

kebab-case, matching the class it styles. A `.card__title` rule lives in
`components.css`, not in a file named `typography.css` — a stylesheet organised by concept
is a stylesheet nobody can find anything in.
---
name: design-principles
description: The five standing principles of the Silver Glass design system — self-contained, token-driven, layered, progressive, runtime-composed chrome.
---

# Design principles

Five rules. A change that violates one is not a variation, it is a violation — there is no
"just this once" exception.

## 1. Self-contained

No external fonts, scripts, stylesheets, CDNs, or runtime network calls. Everything ships
in-repo. Small assets are inlined as data URIs.

The test: unplug the network. The page must look and work exactly the same.

## 2. Token-driven

Every colour, spacing, radius, and shadow decision comes from a CSS custom property.

**Never hard-code a hex value in a component.** If you need a colour that no token names,
that is a gap in the palette — add the token, do not inline the value.

## 3. Layered CSS

Four layers, in order:

```
root tokens  →  shared layout  →  shared components  →  per-section overrides
```

A page pulls in exactly those layers plus its own. Never reach backwards to skip a layer.

## 4. Progressive and accessible

* Semantic HTML first.
* Native elements where they exist — `<details>` for an accordion, not a div with a
  click handler.
* Visible focus states, on every interactive element.
* Sufficient contrast, verified rather than assumed.
* Responsive down to ~360px.

## 5. Runtime-composed chrome

Header and footer are shared partials injected client-side, so navigation lives in one
file and every page stays in sync. See [`runtime-includes.md`](runtime-includes.md).

## Why these five

They are not decoration. Together they are what makes the system droppable: a repository
that adopts the tokens gets the look without inheriting a build, and a repository that
adopts the components never has to reverse-engineer why a page looks the way it does.
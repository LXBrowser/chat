---
name: design-reusability
description: How to adopt Silver Glass in another repository — the five steps, and which tokens to touch for a rebrand.
---

# Reusing in another repository

Silver Glass is built to be dropped into a repository that has nothing else in common with
this one. Five steps.

## 1. Copy the four things

```
css/main.css
css/shared/
js/site.js          # only if the target needs shared header/footer
partials/           # only if the target needs shared header/footer
```

A single-page target that inlines its own chrome needs the CSS only — `js/site.js` and
`partials/` exist to share a header across many pages, and are dead weight when there is
one page.

## 2. Rebrand by editing tokens only

Open `main.css` and change **tokens**, never components:

* `--silver-*`, `--accent*` — the colour
* `--radius*` — only if the target's brand is genuinely sharper or rounder
* `--font`, `--mono` — only if the target has its own system stack

To move off silver, adjust the `--silver-*` ramp, the `--accent*` family, and the body
background gradient. **Leave `--glass-*`, the shadows, and the geometry alone** — they
carry the feel, and the system stops looking like Silver Glass if they move with the
colour.

## 3. Edit the partials

`partials/header.html` and `partials/footer.html` for the new site's navigation and
branding. **Keep the `{{ROOT}}` tokens and the `data-section` attributes** — the loader
depends on both, and removing either fails silently: links point at the wrong depth, and
no nav item highlights.

## 4. Author pages against the components

Use the table in [`components.md`](components.md). Add a `<section>/<section>.css` only
when a page needs a layout no component expresses.

## 5. Keep it self-contained and accessible

No CDN, no webfont, no network call. Then work through
[`accessibility.md`](accessibility.md) — the components handle most of it, but a page that
uses them in a new way can still break it.

## What should survive the port

| Should | Should not |
|---|---|
| The token layer, verbatim | Component overrides tuned for one site |
| The components, unmodified | A subset with "improvements" |
| The overlay opacity rule | Section stylesheets from the old site |
| The accessibility checklist | — |
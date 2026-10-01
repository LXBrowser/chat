---
name: design-runtime-includes
description: The portable header and footer include system — partials, the {{ROOT}} token, and the loader that injects them at runtime.
---

# Runtime includes

Header and footer are injected at runtime, so navigation lives in one file and every page
stays in sync. The pattern is repository-agnostic.

## Partials

`partials/header.html` and `partials/footer.html`.

Internal links inside them use a **`{{ROOT}}`** token in place of the path back to the site
root, because a partial does not know how deep the page including it lives.

```html
<a href="{{ROOT}}docs/index.html">Docs</a>
```

## The loader

`js/site.js` reads two globals the page sets in `<head>`:

| Global | Value | Meaning |
|---|---|---|
| `window.SITE_ROOT` | `""`, `"../"`, `"../../"` | Relative path back to the site root. |
| `window.PAGE_SECTION` | `"docs"` | Which section this page is in, for active-nav highlighting. |

On load it fetches both partials, replaces `{{ROOT}}` with `SITE_ROOT`, wires the mobile
menu and the active link, injects a favicon, and stamps the footer year.

## Mount points

Every page carries:

```html
<div id="site-header"></div>
<!-- page content -->
<div id="site-footer"></div>
```

## Serve over HTTP

This uses `fetch()`, so **`file://` will not work**. Any test or preview of a page using
these partials needs a local server:

```bash
python3 -m http.server 8000
```

## When not to use this

The include system exists for the docs site, where many pages share a chrome. The Chrome
extension has exactly one page and no shared chrome — `src/ui/index.html` inlines
everything. See [`extension-adaptation.md`](extension-adaptation.md).
---
name: design-components
description: The shared component library — class names, structure, and behaviour notes for every Silver Glass component.
---

# Components

Provided by the shared component stylesheet. **Use these class names as-is.** Writing a
near-duplicate of one of these is the failure this list exists to prevent.

| Component | Class(es) | Notes |
|---|---|---|
| Hero banner | `.hero` | Large intro glass panel with a soft radial glow. |
| Panel / section | `.panel`, `.section` | Grouped glass block. |
| Card grid | `.card-grid` > `.card` | Auto-fill, min 248px. `a.card` is clickable and lifts on hover. Inner: `.card__icon`, `.card__title`, `.card__desc`, `.card__more`. |
| Feature list | `.feature-list` | Stacked highlighted rows. |
| Accordion | `details.acc` > `summary` + `.acc__body` | **Native `<details>`** — no JS. `+`/`–` marker via CSS. Group in `.accordion`. |
| Code | `pre` / `code` | Dark `pre` (`#1c2431`); inline `code` tinted with accent. `.code-label` for a caption. |
| Table | `.table-wrap` > `table` | **Always** wrap a table in `.table-wrap` for horizontal scroll. |
| Badge / chip | `.badge` (`--accent` / `--ok` / `--warn`), `.chip`, `.chip-row` | Small status and label markers. |
| Button | `.btn` (`--primary` / `--sponsor`), `.btn-row` | Pill buttons; primary and sponsor are gradient-filled. |
| Callout | `.callout` (`--info` / `--warn` / `--danger`) | Icon plus body, as an aside. |
| Definition list | `.deflist` > `.deflist__row` (`.deflist__term`) | Two-column term and description. |
| Eyebrow / lead | `.eyebrow`, `.lead` | Section kicker and intro paragraph. |
| Breadcrumbs | `.breadcrumbs` (`a`, `.sep`) | Page context trail. |

## Compose, don't rebuild

Before writing a new rule, check this table twice. A component that is *nearly* `.card` is
a `.card` with a modifier class.

```css
/* correct */
.card--compact { padding: var(--space-sm); }

/* wrong — a .card with three properties changed */
.thing { background: var(--glass); border-radius: 12px; padding: 8px; }
```

## When a page genuinely needs bespoke CSS

Add a **per-section stylesheet** for a layout no component expresses — a slot map, a stat
bar, a timeline. Not for a component that is slightly different.

One section, one file. It composes the shared components; it does not redefine them. See
[`css-organization.md`](css-organization.md).

## Accessibility carried by the components

These are already handled and should not be re-implemented:

* the accordion is a real `<details>`, so it is keyboard-operable and announced correctly
* the dropdown opens on `:focus-within`, so it is reachable by keyboard
* the mobile menu toggle is a real `<button>`

Full checklist in [`accessibility.md`](accessibility.md).
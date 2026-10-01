---
name: design-tokens-glass
description: The transparent glass surface tokens — panel fills, borders, and the blur value used by every raised surface.
---

# Tokens — glass surfaces

The translucent tier. These are what make the system read as "glass" rather than as grey
boxes.

| Token | Value | Use |
|---|---|---|
| `--glass` | `rgba(255,255,255,.62)` | Default panel and card fill. |
| `--glass-strong` | `rgba(255,255,255,.90)` | Header and buttons — stays readable even without blur. |
| `--glass-faint` | `rgba(255,255,255,.40)` | Subtle inset blocks. |
| `--glass-border` | `rgba(255,255,255,.75)` | The highlight border along the top edge. |
| `--hairline` | `rgba(120,133,154,.28)` | Dividers and low-contrast borders. |
| `--surface-solid` | `rgba(255,255,255,.98)` | Near-opaque fallback for content-covering overlays. |
| `--blur` | `saturate(160%) blur(14px)` | The `backdrop-filter` value for glass. |

## Choosing a tier

| You are making | Use |
|---|---|
| A card or panel over the backdrop | `--glass` |
| A header bar, or a button label | `--glass-strong` |
| An inset block inside a panel | `--glass-faint` |
| Anything that **covers page content** | `--surface-solid` |

The last row is a hard rule, not a preference — the reasoning is in
[`overlay-opacity.md`](overlay-opacity.md), and it is the single most-missed rule in this
system.

## The blur is decorative

`backdrop-filter` has no effect in environments that do not support it, or where it is
disabled. Every surface must still be legible with the blur silently dropped — which is
why the fills carry alpha rather than being transparent. `--glass-strong` exists precisely
for surfaces that must never depend on it.

## Contrast warning

Body text on `--glass` over the silver field meets WCAG AA. Text on `--glass-faint` is a
different question — check contrast before placing body copy there.
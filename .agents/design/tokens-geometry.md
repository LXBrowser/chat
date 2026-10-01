---
name: design-tokens-geometry
description: Shadows, radii, layout widths, fonts, and the fixed silver gradient backdrop that Silver Glass renders over.
---

# Tokens — geometry, type, backdrop

Everything that is not colour and not glass.

## Shadows

| Token | Value |
|---|---|
| `--shadow-sm` | `0 1px 2px rgba(27,36,48,.06), 0 2px 8px rgba(27,36,48,.05)` |
| `--shadow-md` | `0 6px 22px rgba(27,36,48,.10)` |
| `--shadow-lg` | `0 18px 48px rgba(27,36,48,.16)` |

`--shadow-sm` is the resting state for every raised surface. `--shadow-md` is for
content-covering overlays. `--shadow-lg` is the hover lift.

## Radii

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `10px` | Chips, badges, small controls. |
| `--radius` | `16px` | Panels, cards — the default. |
| `--radius-lg` | `22px` | Hero banners and large surfaces. |

## Layout

| Token | Value | Use |
|---|---|---|
| `--maxw` | `1120px` | Content max width. |
| `--header-h` | `64px` | Sticky header height. |

## Type

| Token | Value |
|---|---|
| `--font` | system UI stack — `-apple-system, "Segoe UI", Roboto, …` |
| `--mono` | system mono stack — `ui-monospace, "JetBrains Mono", Consolas, …` |

Both are **system** stacks. Loading a webfont would break
[`principles.md`](principles.md) §1.

## The backdrop

The page background is a fixed, layered silver gradient — soft white highlights at the top
left and top right, and a light silver wash toward the bottom, over a
`linear-gradient(160deg, #eef1f6 → #dbe1ea)`.

It is `background-attachment: fixed`, so content scrolls over a stable field rather than
sliding across a gradient. This is what makes the glass blur read as depth.

## The one thing not to change on a rebrand

Geometry and shadows carry the feel; colour carries the brand. Retuning `--silver-*` and
`--accent*` is a rebrand. Retuning radius and shadow is a redesign — and the two will not
survive each other, because a smaller radius on a soft shadow reads as a different product.
---
name: design-tokens-palette
description: The Silver Glass colour palette — white and silver surfaces, ink for text, accent and intent colours. Declared once on :root.
---

# Tokens — palette

Declared once on `:root` in the stylesheet's token layer. Reuse these names verbatim; they
are the system's public vocabulary.

## White and silver

| Token | Value | Use |
|---|---|---|
| `--white` | `#ffffff` | Pure surfaces, button text on accent. |
| `--silver-050` | `#f6f8fb` | Lightest tint. |
| `--silver-100` | `#eef1f6` | Background top. |
| `--silver-200` | `#e2e7ee` | Background mid. |
| `--silver-300` | `#d2d9e3` | Backdrop blobs. |
| `--silver-400` | `#b9c2d0` | Muted fills. |
| `--silver-500` | `#9aa6b8` | Bar starts, dividers. |
| `--silver-600` | `#78859a` | Strong silver. |

## Ink — text

| Token | Value | Use |
|---|---|---|
| `--ink-900` | `#1b2430` | Headings, strong text. |
| `--ink-700` | `#333f4f` | Body text. |
| `--ink-500` | `#5a6676` | Secondary / lead text. |
| `--ink-400` | `#78859a` | Muted captions, eyebrows. |

## Accent

| Token | Value | Use |
|---|---|---|
| `--accent` | `#5b7189` | Cool steel accent. |
| `--accent-strong` | `#3f5872` | Links, emphasis. |
| `--accent-soft` | `rgba(91,113,137,.12)` | Accent chip and active backgrounds. |
| `--sponsor` | `#d6336c` | Donation / call-to-heart accent. |
| `--sponsor-soft` | `rgba(214,51,108,.10)` | Sponsor backgrounds. |

## Intent

Used by badges and callouts:

| Intent | Value |
|---|---|
| Success | `#1f7a54` |
| Warning | `#9a6b16` |
| Danger | reuses `--sponsor` — there is no separate danger token |

## Rebranding

To move off silver, edit **only** these: the `--silver-*` ramp, the `--accent*` family, and
the body background gradient. Leave `--glass-*`, the shadows, and the geometry tokens
alone — they carry the feel, not the colour.

Related: [`tokens-glass.md`](tokens-glass.md), [`tokens-geometry.md`](tokens-geometry.md).
---
name: design-glass-surface-recipe
description: The five-line CSS every raised surface follows — fill, blur, highlight border, shadow, radius — plus the hover lift.
---

# The glass surface recipe

Every raised element — panel, card, header, button — is this and nothing else:

```css
background: var(--glass);
-webkit-backdrop-filter: var(--blur);
backdrop-filter: var(--blur);
border: 1px solid var(--glass-border);
box-shadow: var(--shadow-sm);
border-radius: var(--radius);
```

Six properties. If a surface needs a seventh, it is not a raised surface — see
[`overlay-opacity.md`](overlay-opacity.md) before you add one.

## The highlight border

`--glass-border` is near-white, which is why it reads as a *highlight along the top edge*
rather than as an outline. That is the entire optical trick behind the glass look: a light
line where the surface meets the backdrop, and almost nothing elsewhere. Do not darken it
to make an edge more visible — a visible border is a different aesthetic.

## The hover lift

Interactive cards lift on hover:

```css
transform: translateY(-4px);
box-shadow: var(--shadow-lg);
```

Four pixels and one shadow. Anything more looks like the card is leaving.

## Transitions

Short. `.15s` to `.2s` on `ease`. The system is calm; a slow transition reads as lag,
because the eye is already reading the backdrop move behind it.

Transition `transform`, `box-shadow`, and `background-color`. Do not transition
`backdrop-filter` — it is expensive to composite and the difference is invisible.

## Applying the recipe

In practice a class sets it once:

```css
.panel {
  background: var(--glass);
  -webkit-backdrop-filter: var(--blur);
  backdrop-filter: var(--blur);
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-sm);
  border-radius: var(--radius);
}
```

Then components compose that class rather than repeating the recipe. **Prefer composing the
existing components over writing new CSS** — a new surface that is nearly a panel should
be a panel with a modifier, not a near-copy.
---
name: design-index
description: Index of .agents/design/ — the Silver Glass design system, one subject per file, plus how it adapts to the extension.
---

# Design index

Parent: [`root-index.md`](root-index.md).

The **Silver Glass** design system — a universal, dependency-free visual language for
static documentation sites, authored in this repository and adopted by the extension.

This index lives in `.agents/index/` rather than inside `.agents/design/` because no index
ever lives inside its own scope. Any file added to or removed from `.agents/design/` is
reflected here **in the same commit**.

## Foundations

Read these first. Everything else refers back to them.

| File | Purpose |
|---|---|
| [`../design/principles.md`](../design/principles.md) | The five standing rules: self-contained, token-driven, layered, progressive, runtime-composed. |
| [`../design/tokens-palette.md`](../design/tokens-palette.md) | White and silver surfaces, ink for text, accent and intent colours. |
| [`../design/tokens-glass.md`](../design/tokens-glass.md) | The translucent tier — panel fills, highlight border, and the blur value. |
| [`../design/tokens-geometry.md`](../design/tokens-geometry.md) | Shadows, radii, layout widths, fonts, and the fixed backdrop. |

## Surfaces

| File | Purpose |
|---|---|
| [`../design/glass-surface-recipe.md`](../design/glass-surface-recipe.md) | The six properties every raised surface follows, plus the hover lift. |
| [`../design/overlay-opacity.md`](../design/overlay-opacity.md) | Overlays covering page content must be opaque. The most-missed rule in the system. |

## Building

| File | Purpose |
|---|---|
| [`../design/components.md`](../design/components.md) | The component table — class names, structure, and behaviour. |
| [`../design/css-organization.md`](../design/css-organization.md) | File layout and load order for the stylesheets. |
| [`../design/layout-chrome.md`](../design/layout-chrome.md) | Containers, header, footer, and the no-horizontal-scroll rule. |
| [`../design/runtime-includes.md`](../design/runtime-includes.md) | Shared header/footer partials and the loader that injects them. |

## Adopting and auditing

| File | Purpose |
|---|---|
| [`../design/reusability.md`](../design/reusability.md) | Dropping the system into another repository; which tokens to touch on a rebrand. |
| [`../design/accessibility.md`](../design/accessibility.md) | The checklist — landmarks, heading order, focus, contrast, motion. |

## This repository

| File | Purpose |
|---|---|
| [`../design/extension-adaptation.md`](../design/extension-adaptation.md) | How the system maps onto the MV3 extension: what carries over, what changes, and which overlays must be opaque. |
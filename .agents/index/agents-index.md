---
name: agents-index
description: Index of this repository's local instruction files — the rules that are true only for the LXBrowser chat extension.
---

# Agents index

Parent: [`root-index.md`](root-index.md).

This repository's instruction set. Anything true only here belongs here; anything true
across the organization belongs to the shared set served by the `lxagents-shared-instruction`
connector, and is **not** copied in.

Any file added to or removed from this scope is reflected here **in the same commit**.

## `rules/`

| File | Purpose |
|---|---|
| [`../rules/repository.md`](../rules/repository.md) | Project-specific rules: the MV3 stack, what may not be introduced, and where things live. |

The repository carries no `git/`, `prompts/`, or `creators/` folder — those are served by
the connector.
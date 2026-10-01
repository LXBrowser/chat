---
name: project-wiki-index
description: Index of wiki/ — human-facing project documentation, excluding the logs tree, which logs-index.md owns.
---

# Project wiki index

Parent: [`root-index.md`](root-index.md).

Documentation a **person** reads: contributors, users, reviewers. Plain markdown, no
frontmatter. Agent-facing knowledge is in `.agents/wiki/`, routed by
[`agent-wiki-index.md`](agent-wiki-index.md) — this index never lists files from that
tree, it points at its router.

Any file added to or removed from this scope is reflected here **in the same commit**.

## `information/`

| File | Purpose |
|---|---|
| [`../../wiki/information/overview.md`](../../wiki/information/overview.md) | What the extension is, its stack, and its current state. |

## `environments/`

| File | Purpose |
|---|---|
| [`../../wiki/environments/setup.md`](../../wiki/environments/setup.md) | Load the unpacked extension and open the new-tab page. |
| [`../../wiki/environments/env.md`](../../wiki/environments/env.md) | How the OpenRouter API key is supplied and stored. |

`logs/` is not listed here — it is routed by [`logs-index.md`](logs-index.md).
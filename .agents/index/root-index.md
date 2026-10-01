---
name: root-index
description: The single entry point to every index this repository can reach — six local indexes plus the shared router, with the override table.
---

# Root index

This file lists **indexes only** — never rules, never leaf content.

Adding, removing, or renaming any index updates this table **in the same commit**.
Adding or dropping an override updates the override table **in the same commit**.
Read exactly **one branch per task** from here, plus `memory-index.md` every session.

## Indexes

| Index | Scope | Load when |
|---|---|---|
| [`agents-index.md`](agents-index.md) | This repository's instruction set | You need a rule specific to this repository. |
| `{shared}/index/root-index.md` | The shared instruction set | You need a branching, commit, pull request, planning, or creator convention. |
| [`agent-wiki-index.md`](agent-wiki-index.md) | `.agents/wiki/` agent knowledge | You need an SOP, domain guideline, or operating context written for agents. |
| [`project-wiki-index.md`](project-wiki-index.md) | `wiki/` human documentation | You need to read or write documentation a person will read. |
| [`memory-index.md`](memory-index.md) | `.agents/memory/` dynamic state | You need prior task state or must record progress. |
| [`logs-index.md`](logs-index.md) | `wiki/logs/` versioned change logs | You need release history or must record a change. |

## Shared overrides

| `name` | Local file | Replaces | Why |
|---|---|---|---|

*No overrides — this repository uses the shared set unchanged.*
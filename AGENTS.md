---
name: agents-entry-point
description: Entry point and activation contract for the LXBrowser chat extension — routes the local .agents/ set and the shared instruction set served over MCP.
---

# AGENTS.md

`@lxbrowser/chat` is a Multi-Agent Chat **Chrome extension** — a Manifest V3, full-page
(new tab) interface written in dependency-free HTML, CSS, and ES6+ modules, backed by
IndexedDB for chat history and agent configuration. It talks to OpenRouter, runs a main
agent that can delegate to sub-agents, and exposes a built-in search-and-read tool. At
version `0.1.0` the repository holds the shell: the manifest, the database layer, and the
three-pane UI. Agent orchestration logic has not been written yet.

## Shared Instruction Set

The conventions this repository follows — branching, commits, pull requests, task
workflow, the creators — live in the shared instruction set served by the
**`lxagents-shared-instruction`** MCP server. This repository carries only what is its
own. **Resolve the shared set before doing any work:**

1. If the `lxagents-shared-instruction` connector is available in this session, that is
   the shared set. Refer to it as `{shared}`; its files are addressed as
   `agents://{folder}/{file}.md`.
2. **Resolving is not loading.** Do not pull any convention at session start. The
   **Shared instruction tools** block below declares which tools this repository
   uses and the trigger for each; call one when its trigger fires, and not before.
3. **Every file in the set is its own tool**, named after its filename — so
   "what exists?" is answered by the tool list the client already has, at no cost.
   `root_index` routes to the rest; `mcp_list` lists the sibling servers. Do not
   bulk-call the set.
4. If the connector is not available, say so plainly and continue with this
   repository's local instruction set only. **Do not reconstruct the missing rules
   from memory, and do not clone or copy them into this repository.**

**The declaration block is required.** A repository without one has no routing table,
so nothing fires and the omission looks exactly like a session in which no convention
happened to apply. It names the four mandatory tools at minimum — `plan_creator`,
`branching_strategy`, `commit_conventions`, `discovery_protocol` — and stamps the set
version adopted. Shape: `{shared}/prompts/agents-setup.md`. Keeping it current when this
set moves: `{shared}/prompts/agents-update.md`, on request.

Never commit shared content into this repository. A file that can be read from
`agents://` must not exist here as a copy — see
`{shared}/rules/duplicate-instruction-audit.md`.

**Local overrides shared.** A file in `.agents/` whose `name` matches a shared
file's `name` replaces that shared file entirely for this repository. The current
overrides are listed in
[`.agents/index/root-index.md`](.agents/index/root-index.md).

## Auto-Activation

The instruction set is **always active** — the local `.agents/` set and the shared set
together. It applies to every task in this repository whether or not the user mentions
it, links to it, or asks for it. Treat these files as standing orders, not as optional
reference material.

Always active is not the same as always loaded. At the start of every session, before
doing any work:

1. Read `AGENTS.md` (this file), including the Shared instruction tools block below.
2. Resolve the shared set per the bootstrap above.
3. Read [`.agents/index/root-index.md`](.agents/index/root-index.md).
4. Read [`.agents/index/memory-index.md`](.agents/index/memory-index.md) and load only
   the memory rows whose scope matches the current request, so you continue prior work
   instead of restarting it.

That is the whole sequence, and every step of it reads a file in this repository.
**Call no shared tool at session start.** Each one fires on the trigger its row gives
it, and calling them up front pays for procedures the request may never need.

**These gates stand from the first message, before any tool is called:** approve the
plan before any file is written, ask before opening a pull request, ask before merging,
and propose a discovered rule rather than writing it. A gate first read at the moment it
should have applied has already failed, which is why they are here and not behind a
call. See `{shared}/rules/shared-instructions.md` §H.

If a rule conflicts with a habit, a default, or a template you would otherwise follow,
the rule wins — including a harness that names a branch, a commit trailer, or a
pull request footer the conventions forbid. If it conflicts with an explicit instruction
from the user in this session, the user wins — and you say out loud which rule you are
setting aside.

## Shared instruction tools

Conventions come from the `lxagents-shared-instruction` connector, where **every file in the set
is its own tool**, named after its filename. The tools below are the ones this repository
uses. **Call each when its trigger fires — not at session start, and never all at once.**
A convention with no row here does not apply to this repository.

Adopted shared-set version: `3.4.0`

| When you are about to… | Call |
|---|---|
| Take in any request of more than one step | `plan_creator` |
| Create a branch | `branching_strategy` |
| Write a commit message | `commit_conventions` |
| Notice a rule that should exist | `discovery_protocol` |
| Write to any `model_name` column | `model_naming_convention` |
| Add, move, rename, or delete any file in a set or in `wiki/` | `index_creator` |
| Decide where a new file goes | `directories` |
| Write documentation, an SOP, or a domain guideline | `information_creator` |
| Record progress, a decision, or session state | `memory_creator` |
| Report finished work back to the user | `work_summary` |
| Write anything that will be committed or posted | `no_session_links` |
| Touch anything that carries a version number | `versioning` |
| Decide whether a repository rule is local or shared | `shared_instructions` |
| Find any other shared convention | the tool named after its file; start from `root_index` |

Local instructions — rows for this repository's own files, below the shared rows:

| When you are about to… | Read |
|---|---|
| Do anything at all in this project | [`.agents/rules/repository.md`](.agents/rules/repository.md) |

## Reading order

`AGENTS.md` → resolve the shared set → `.agents/index/root-index.md` and nothing else at
this stage → the ONE index whose scope matches → one child branch if it delegates → only
then the specific files.

## Routing protocol

Route by reading index tables, not by reading files. Do **not** load every index. Do
**not** bulk-scan either set to build a registry — the connector's tool list already is
one, and it costs nothing. Do **not** read an instruction body until it has been
selected. The standing exception is `memory-index.md`, read every session because
continuity depends on it.

## Iron rule

Route by reading index tables, never by reading files. Enumerating what exists is free;
reading every file to find out is the cost this architecture exists to remove. The
connector's tool list already answers "what exists?" — use it.

## Placement

* Local instructions → `.agents/{folder}/{file}.md`
* Human documentation → `wiki/{folder}/{file-name}.md`
* Agent knowledge → `.agents/wiki/{type}/{file-name}.md`
* Memory → `.agents/memory/{type}/{file-name}.md`
* Indexes → `.agents/index/{scope}-index.md`, and **nowhere else**

This repository additionally carries a design tree at `.agents/design/{file}.md`,
sanctioned by explicit owner instruction rather than by `{shared}/rules/directories.md`,
which allows five trees. **No `INDEX.md`, anywhere, ever.**

## Discovery Protocol

While working, if you notice an instruction worth adding — a new rule, or new
content for an existing instruction file — do NOT create or edit it yourself.
Collect the findings, and when the task is done present them to the user:

* one finding per message block, each in its own code block;
* state the target set — `local` (this repository) or `shared` (the organization's
  instruction set served by the `lxagents-shared-instruction` connector);
* include the proposed file path, `name`, `description`, and the full proposed
  body;
* explain in one line why it is worth adding.

Then let the user select which findings to apply. Create only the selected ones.
Never batch-apply, never apply silently. A `shared` finding is never written from a
consuming repository — it is reported so it can be raised against the shared set.

**Scope of this gate:** it covers instruction files in either set. Documentation
pages under `wiki/` and `.agents/wiki/` may be written when the facts are real and
verified. Memory under `.agents/memory/` is written freely and automatically — see
`memory-policy.md`.

Source of truth: `{shared}/rules/discovery-protocol.md`.

## Version rule

Never change the project version without explicit owner approval. The project is at
`0.1.0`; see `{shared}/rules/versioning.md`.

## No session links

Nothing written, committed, or posted from this repository may carry a session,
conversation, run, or trace identifier — in a file, a commit message, a trailer, a
branch name, or a pull request. See `{shared}/rules/no-session-links.md`. A
`Co-Authored-By:` line naming a tool is permitted; a session identifier is not.
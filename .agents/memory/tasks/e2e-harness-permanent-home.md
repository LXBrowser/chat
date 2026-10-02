---
name: memory-tasks-e2e-harness-permanent-home
description: Moving the Playwright harness out of /tmp into tests/e2e/, and rescoping the build-step rule so the shipped tree stays dependency-free without the tests being homeless.
status: done
---

# Browser harness gets a permanent home

The local finding from the transcript-stability task, applied. The harness had been living
in `/tmp/pw` — untracked, unversioned, and lost to any reboot — because
`.agents/rules/repository.md` forbade a `package.json` anywhere in the repository.

## Task 1 — Move the harness

Branch `test/e2e-harness`. The eleven `.mjs` scripts moved to `tests/e2e/`, with a
`package.json` beside them carrying Playwright as the single dev dependency.

**Under `tests/e2e/`, not at the repository root.** This was the load-bearing decision.
A root `package.json` would have put a `node_modules/` inside the directory Chrome loads
unpacked — the shipped tree would no longer be exactly what ships, which is the invariant
the old rule existed to protect. Keeping both inside `tests/e2e/` satisfies the harness and
leaves the root byte-identical. Node resolves `node_modules` by walking up from the importing
file, so nothing has to change to make that work.

`.gitignore` gained `node_modules/` — unanchored, so it matches at any depth.

## Task 2 — Rescope the rule rather than delete it

The rule did not become wrong; it was written about the wrong scope. It read "the repository
has no `package.json` and no `node_modules`", when what it protects is the **shipped
tree**. Rewritten to that, with Playwright named explicitly as a dependency of the harness
and never of the extension.

The invariant survives intact and is now checkable: what ships is `manifest.json`, `src/`,
and `src/ui/icons/`, nothing is produced by a command, and `manifest.json` names no
dependency because there is none.

A **Testing** section carries the standard — the three findings that are not obvious:
`channel: 'chromium'` because `chrome-headless-shell` cannot load an extension at all;
`context.route` and never a worker-side `fetch` patch, because a worker-side patch dies
with the worker and a worker being recycled is what the suite is about; and every check
must be shown able to fail.

## Verification

Re-run from the new location, not assumed to work there:

| Suite | Result |
|---|---|
| `verify.mjs` — browser | 24/24 |
| `verify-ping.mjs` — keep-alive | 3/3 |
| `static.mjs` — structural | 11/11 |

`git check-ignore` confirms `tests/e2e/node_modules` is excluded and `.agents/plans/`
still is.

## Two defects found by moving it

Neither was caused by the move — both were already in `/tmp`, and both were invisible
because the scripts there were never run as a set.

* **`smoke.mjs` could not start.** It imported `stubFetch` from the harness, which the
  switch to `context.route` routing had already replaced. It had not been run since that
  rewrite. Rewritten against `routeOpenRouter`.
* **A counter I introduced while rewriting it.** Destructuring `const { hits } =
  await routeOpenRouter(...)` snapshots zero before the first request is made, so the
  script reported `openrouter requests: 0` beside a plainly successful send. `verify.mjs`
  counts with its own closure variable and was never affected.

Two scripts still hardcoded `/workspaces/chat` as the extension root (`static.mjs`,
`probe-route.mjs`); both now derive it from the harness, which resolves it from this file's
own location. `CHAT_EXT` still overrides it — that is what lets the same suite run against
a pre-fix worktree and be required to fail.

## Left open

The harness runs the suites it has. There is no CI, no lint step, and no runner that
executes `app.js` outside a browser; `npm test` is the entry point and a person running it.
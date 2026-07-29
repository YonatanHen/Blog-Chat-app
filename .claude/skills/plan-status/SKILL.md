---
name: plan-status
description: >-
  Use on the Blog-Chat-app repo whenever the question is "where are we?" or "what's next?" — status of the
  current phase plan, which tasks are done, what task to pick up, what's left before a phase ships, or
  orienting at the start of a session after time away. Reads docs/superpowers/plans/ and derives real
  status from git and the code rather than the plan's checkboxes (which are never ticked and always read
  0% done). Trigger it on "what's the status", "where did we leave off", "what should I work on next",
  "what's left in P2", "catch me up", "is task N done", or before starting any new task on this project —
  even when the user doesn't name the plan.
---

# Plan Status

## Why this exists

Phase plans live in `docs/superpowers/plans/`. They are long (P2 is ~2,200 lines) and they track steps with
`- [ ]` checkboxes — **but nobody ever ticks them.** P2 is 0-of-75 checked while Tasks 1–6 are merged to
`staging`. So the two obvious ways to answer "where are we" both fail: reading the checkboxes reports 0%
and sends you to redo Task 1, and reading the whole plan burns thousands of tokens to reach the same wrong
answer.

The plan is the **specification**; git and the working tree are the **record of what shipped**. This skill
reads the plan for *what the work is* and reads the repo for *what's done*, then reports the join.

## Step 1 — Scan

```bash
python .claude/skills/plan-status/scripts/scan_plan.py
```

Add `--plan <path>` for a specific phase, `--base <branch>` to change what counts as already-merged
(default `master`). The script picks the newest plan not marked complete, and emits JSON with: the task
ledger (number, title, line number, declared files, `Produces` interfaces, planned commit message),
per-task evidence, amendment blocks, and git position.

**Do not read the plan file top-to-bottom.** The scan plus a targeted read of the next task's line range is
the whole job; reading 2,000 lines to report six facts is the failure mode this skill exists to prevent.

Each task carries a `signal` built from two independent axes — do its declared files exist, and did a
commit matching its planned message land:

| signal | meaning | what to do |
|---|---|---|
| `LIKELY_DONE` | files present **and** a matching commit | trust it |
| `NOT_STARTED` | declared files absent, nothing shipped | trust it |
| `NEEDS_CHECK` | the axes disagree | resolve it in Step 2 |
| `NO_EVIDENCE` | task declares no files (docs/gate tasks) | resolve it in Step 2 |

## Step 2 — Resolve the frontier

Only resolve tasks the scan left uncertain, and usually only the first one or two — a `NEEDS_CHECK` at
Task 11 doesn't matter when Task 7 is the frontier. Two things routinely make the mechanical signals
disagree, and both need judgment:

**Commit messages drift.** The plan prescribes `feat(client): typed API wrappers (client.ts + auth/posts/users)`;
the commit that actually shipped it says `feat(client): api client layer with typed wrappers`. Token
matching misses this, so a done task shows `NEEDS_CHECK` with no evidence. Scan `git log --oneline -40`
yourself for a commit that plainly covers the task's subject.

**Files exist as stubs.** Earlier tasks create placeholder pages so the app compiles — `PostPage.tsx`
exists from Task 5, but Task 7 is what fills it in. Existence proves nothing here; the plan itself says
"replace the Task 5 stub". This is what the task's **`Produces`** line is for: it names the exact symbols
the task must yield (`usePost(slug)`, `<LikeButton />`, `AutoForm`). Grep for those:

```bash
grep -rn "export function usePost\b" apps/client/src/hooks/
```

Present and substantive → done. Absent, or the file is a few lines returning a heading → not done. When
still genuinely ambiguous after that, say so in the report rather than picking a side; a wrong "done"
costs more than an honest question.

## Step 3 — Report

Lead with this block. It is deliberately compact — the user asked where things stand, not for a recital of
the plan. Task count, titles, and line numbers all come from the scan; never assume a phase's task count
from memory.

```
P2 — React Client · 6/13 tasks shipped
Branch: staging (clean, up to date with origin)

✅ 1 Vite scaffold       ✅ 4 Query/router/shell
✅ 2 UI primitives       ✅ 5 Auth pages
✅ 3 API client layer    ✅ 6 Blog feed
▶  7 Post detail page (gating UI)
○  8 AutoForm   ○ 9 Delete   ○ 10 Likes
○  11 Docker    ○ 12 E2E     ○ 13 Final gate

⚠ Amendment 2026-07-25: `premium` is gone — ignore that
  line in the Tasks 8/10/12 snippets.

Next: Task 7 (plan L1284)
  hooks/use-posts.ts   + usePost
  pages/PostPage.tsx   replace the Task-5 stub
  git checkout -b dev/post-detail-page
```

Rules for the block:

- **Surface amendments.** Plans get amended in place (`> **Amendment ...**`) and those notes supersede the
  code snippets below them. Someone following an amended snippet reintroduces work that was deliberately
  removed — that's why this gets a line of its own rather than a footnote.
- **Flag git position honestly.** Uncommitted changes, a `dev/*` branch with unmerged work, or local
  `staging` behind `origin/staging` all change what "next" means. CLAUDE.md requires feature branches off
  an up-to-date `staging`, so a stale `staging` is a blocker to state, not a detail to skip.
- **Propose the branch, don't create it.** Name it after the feature, never the task number
  (`dev/post-detail-page`, not `dev/task-7`) — a CLAUDE.md rule. Give the command; let the user run it.
- Keep to the shipped/next/remaining shape. Offer the detail ("want the full step list for Task 7?")
  instead of pre-emptying it into the reply.

## Scope

This skill reports; it doesn't act. It never edits the plan (the checkboxes stay untouched — deriving
status fresh each time can't go stale, and a wrong verdict written into a doc outlives the mistake), never
creates branches, and never starts the next task. When the user then says "go", that's implementation
work — hand off to `superpowers:subagent-driven-development` or `superpowers:executing-plans`, which is
what the plan's own header asks for.

**Completed plans** announce themselves — `(COMPLETE)` in the title or a `**Status:** all N tasks shipped`
line — and record their history in a prose "Completion log" rather than checkbox tasks. The scan flags
them in `plans[].complete`. Summarize from the Status line; don't build a ledger for a phase that's done.

If the user asks about a phase with no plan file yet (P3–P6), say so plainly and point at spec §13, which
is where the phase table lives.

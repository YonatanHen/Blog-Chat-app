---
name: readme-maintenance
description: >-
  Use on the Blog-Chat-app repo right before opening a PR from a dev/* branch — check whether README.md
  needs an update given what the branch actually changed, and update it if so, BEFORE the PR is opened, so
  the README update lands in the same PR as the change it documents. Also use whenever the user explicitly
  asks to check, update, or review README.md, independent of any PR. Trigger on "open a PR", "ready to PR",
  "create the PR", "let's ship this", "update the README", "does the README need updating", or any point in
  the git-feature-branch workflow where a PR is about to be created — even if the user doesn't mention the
  README themselves.
---

# README Maintenance

## Why this exists

`README.md` on `staging` is a deliberately maintained baseline (rewritten 2026-07-29) covering six things:
project summary, architecture diagram, core-flow diagrams, tech stack, core features, and local-run
commands. A baseline like that only stays true if every PR that changes one of those six things updates
the matching section — otherwise it drifts the same way the pre-rewrite README did (still describing a
CRA/Redux app years after the rebuild started). This skill is the checkpoint that catches that drift at
the one moment it's cheapest to fix: before the PR opens, using the diff that's already sitting there.

**This skill never invents a new baseline.** If README.md looks structurally wrong for reasons unrelated to
the current branch's diff (sections missing entirely, describing a different architecture altogether),
that's a signal the baseline itself needs redoing — stop and say so rather than trying to patch it
piecemeal.

## Step 1 — Check whether README.md already moved on this branch

```bash
python .claude/skills/readme-maintenance/scripts/check_readme.py --base origin/staging
```

Swap `--base` if the branch stacks on something other than `staging` (dev-off-dev, per the
feature-branch-discipline rule). The script only gathers facts — merge-base, every changed file, the
branch's commit subjects, any `package.json` diffs, and which `apps/*`/`packages/*` directories were
touched — it makes no judgment call.

**If `readme_already_touched_on_this_branch` is true, stop here.** Skip straight to opening the PR. Don't
second-guess an update that's already part of the branch's own commits — that's the "check git commits"
part of this skill's job, and it's mechanical, not a judgment call.

## Step 2 — Decide if the diff actually touches one of the six sections

README.md has exactly six load-bearing sections (`## About`, `## Architecture`, `## Core flows, in a
nutshell`, `## Tech stack`, `## Core features`, `## Quick start` + `## Scripts`). Map the script's output
onto them:

| Signal from Step 1 | Section likely affected |
|---|---|
| A new top-level dir under `apps/*` or `packages/*` (e.g. a brand-new `apps/realtime`) | Architecture diagram |
| A new REST resource, a new primary user-facing capability, or removal of one | Core features |
| `package_json_diff` adding/removing a real dependency (not a devDependency version bump) | Tech stack table |
| A new root `npm run <script>` in `package.json`, or a changed `docker compose` invocation | Quick start / Scripts |
| A new or materially changed primary flow (how auth works, how gating works, a new one entirely) | Core flows diagrams |
| Bugfixes, refactors, test-only changes, internal renames, dependency patch bumps, anything that doesn't change what a reader of the README would need to know | **None — no update needed** |

A branch can legitimately touch none of these. **Say so explicitly** ("this is a pure bugfix, no README
section is affected") rather than silently doing nothing — the difference between "I checked and it
doesn't need one" and "I forgot to check" matters to whoever reads this later.

When in doubt about whether a change is "core" enough to document (a small tag-filter addition to search,
say, vs. the search feature itself already being documented): favor a small, surgical addition to the
existing section over either silence or a rewrite. The README describes what the project *is*, not a
changelog of every diff that ever touched it.

## Step 3 — Update surgically, not wholesale

Edit only the section(s) Step 2 identified, in place. Match the existing style exactly:

- **Architecture / flow diagrams** are Mermaid, in the same terse style as the existing ones (a handful of
  nodes, not every internal function). Look at the diagram you're editing before adding to it — a new node
  that doesn't match the existing diagram's level of abstraction (e.g. naming a specific function inside a
  box that otherwise names only services) will look out of place immediately.
- **Tech stack** is one row per layer (Server / Client / Shared / Testing / Tooling), not one row per
  package — add to the relevant row's list rather than creating a new row for one dependency.
- **Core features** is a flat bullet list of user-facing capabilities, past tense implied ("Threaded
  comments" not "Add threaded comments"). The "Not yet built" note directly underneath it exists on
  purpose — if the branch just built one of those items, move it up into the feature list and remove it
  from that note, don't leave it duplicated in both places.
- **Quick start / Scripts** only changes when a command actually changed — don't reformat the whole table
  for one new row.

Never touch `## Search semantics` or `## The API, if you want to bypass the UI` unless the branch's diff
specifically changes the mechanism those sections describe (e.g. a branch that changes how `$text` search
works, not one that just adds a filter alongside it).

## Step 4 — Commit it onto the current branch, then proceed to the PR

The README update is part of the same change it documents, so it belongs in the same commit or a
same-branch follow-up commit — never a separate branch, and never pushed straight to `staging` (the
README-direct-to-staging exception in `CLAUDE.md` is for README-*only* branches; a README edit that rides
along with a feature branch is just part of that feature's normal PR flow). Once committed, continue with
the rest of the git-feature-branch workflow (push, open the PR, review, CI, merge) as normal.

## Scope

This skill decides *whether* and *what* to edit in `README.md`; it doesn't touch
`docs/architecture/deployment-architecture.md` or the phase plans under `docs/superpowers/plans/` — those
are separate living/point-in-time docs with their own update points (P2 Task 13 established the pattern for
`deployment-architecture.md`; there's no equivalent automated check for it yet). It also never opens the PR
itself or runs CI — it's the one step that happens *before* those, not a replacement for them.

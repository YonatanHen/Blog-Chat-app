# CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 5-stage GitHub Actions pipeline (source → build → test → staging deploy → prod deploy) documented in `docs/architecture/deployment-architecture.md`, as `.github/workflows/ci.yml`.

**Architecture:** A single workflow file with sequential jobs chained via `needs:`. Triggers on `pull_request` only — no `push` trigger, so raw commits to a feature branch never fire CI, only opening/updating a PR does. Stage 4 (staging deploy) spins up the full Docker Compose stack inside the runner and tears it down — no persistent cloud staging environment. Stage 5 (prod deploy) is gated behind a GitHub Environment (`production`) with required reviewers — it never runs unattended.

**Tech Stack:** GitHub Actions, Docker Compose, Node 22 (via `.nvmrc`).

**Branch:** `dev/ci-cd-pipeline`, based on `staging` @ `1e524e15`. This branch develops in an isolated worktree, in parallel with `dev/web-app-scaffold` (Tasks 4-5 of the P1 plan), which is being built inline in the main working directory at the same time. **Do not modify any file outside `.github/workflows/` or this plan's own scope** — the two branches will be reconciled by the human later.

## Global Constraints

- Trigger is `on: pull_request` **only**. No `push:` trigger anywhere in this workflow — confirmed explicitly by the user; a raw commit to a feature branch must never run CI, only opening/updating a PR does.
- Node version comes from `.nvmrc` (currently `22`) via `actions/setup-node`'s `node-version-file` input — never hardcode a version number that could drift from `.nvmrc`.
- Free tier only: GitHub Actions minutes are free for a public repo; nothing in this workflow may reference a paid service.
- Stage 4 (staging deploy) references `compose.e2e.yaml` at the repo root, target `runner` per-service Docker builds. **This file does not exist yet in this worktree** — it is being created in parallel on `dev/web-app-scaffold` (Task 5 of the P1 plan, file `docs/superpowers/plans/2026-07-13-p1-nextjs-foundation.md` Task 12). Write the YAML assuming the exact filename `compose.e2e.yaml` and the health-check pattern described in Task 3 below. You cannot fully execute this stage end-to-end in this worktree — validate everything that doesn't require the file to exist (YAML syntax, job structure, the `docker compose` command syntax against a **stub** `compose.e2e.yaml` you create temporarily for local testing only, then delete before committing — do not commit a stub compose file).
- Stage 5 (prod deploy) must not auto-run. It requires a GitHub Environment named `production` with required reviewers configured — this is a repository setting, not expressible in YAML alone. Document the exact manual setup steps in a comment block at the top of the job.
- Never merge this branch or push to `master`/`staging` without the user's explicit permission — implementers commit locally; do not run `git push` for anything beyond the branch this plan specifies, and never open or merge a PR.

---

## File Structure

```
.github/
└── workflows/
    └── ci.yml       # the entire pipeline, all 5 stages as sequential jobs
```

One file. No other files are in scope for this plan.

---

## Task 1: Workflow skeleton + stages 1-3 (source, build, test)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: root `package.json` scripts `typecheck`, `lint`, `test` (all already exist and pass on `staging`'s current tip).
- Produces: a `build` job and a `test` job, chained via `needs:`, that a later task will extend with `staging-deploy` and `prod-deploy` jobs.

- [ ] **Step 1: Write the workflow skeleton with jobs 1-3**

```yaml
name: CI/CD

on:
  pull_request:

jobs:
  build:
    name: "1-2. Source & Build"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint

  test:
    name: "3. Test"
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run test
```

Note: `build`'s job does not currently run `npm run build` (a real `next build` for `@blog/web`) because `apps/web` is being created in parallel on another branch and does not exist in this worktree. Add a comment `# TODO: add 'npm run build --workspace=@blog/web' once apps/web exists (Task 5, dev/web-app-scaffold)` directly above the `npm run lint` line.

- [ ] **Step 2: Verify locally**

Run the exact commands each job runs, in this worktree, to confirm they'd pass in CI:

```bash
npm ci
npm run typecheck
npm run lint
npm run test
```

Expected: all four exit 0. (There is no `apps/web` in this worktree yet, so `typecheck`/`lint`/`test` only cover `packages/shared` — that's expected and correct for this branch's current scope.)

- [ ] **Step 3: Validate the YAML**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "valid YAML"
```

Expected: `valid YAML`. If `actionlint` is available (`actionlint --version`), also run `actionlint .github/workflows/ci.yml` and fix any reported issues; if it's not installed, skip it rather than installing new tooling.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat(ci): add workflow skeleton with source/build/test stages

Triggers on pull_request only — no push trigger, so raw commits to a
feature branch never run CI, only opening or updating a PR does."
```

---

## Task 2: Stage 4 — ephemeral staging deploy

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `compose.e2e.yaml` (does not exist in this worktree — see Global Constraints). Assume it defines services named `web` and `mongo` at minimum, with `web` exposing port 3000 and a healthcheck.
- Produces: a `staging-deploy` job, `needs: test`.

- [ ] **Step 1: Add the staging-deploy job**

Append to `.github/workflows/ci.yml`:

```yaml
  staging-deploy:
    name: "4. Staging Deploy (ephemeral)"
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Bring up the ephemeral stack
        run: docker compose -f compose.e2e.yaml up --build --wait
      - name: Smoke test
        run: |
          status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/blog)
          echo "Got HTTP $status"
          test "$status" = "200" || test "$status" = "404"
      - name: Tear down
        if: always()
        run: docker compose -f compose.e2e.yaml down -v
```

The smoke test accepts either 200 or 404 for `/blog` because at this point in the overall project the route may not exist yet (404 is an acceptable "the app booted and routed correctly" signal) — a connection failure (curl returning `000`) is the actual failure mode this step exists to catch.

- [ ] **Step 2: Local dry-run against a temporary stub (do not commit the stub)**

Since `compose.e2e.yaml` doesn't exist in this worktree, create a minimal temporary stub to confirm the job's shell commands are syntactically correct and the healthcheck/smoke-test logic works in principle:

```bash
cat > compose.e2e.yaml.stub-DELETE-ME <<'EOF'
services:
  web:
    image: nginx:alpine
    ports: ["3000:80"]
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost"]
      interval: 2s
      retries: 10
EOF
docker compose -f compose.e2e.yaml.stub-DELETE-ME up --wait
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
docker compose -f compose.e2e.yaml.stub-DELETE-ME down -v
rm compose.e2e.yaml.stub-DELETE-ME
```

Expected: the stack comes up, curl returns a status code, teardown succeeds. This only validates mechanics (compose up/down, curl against a container) — it does **not** validate the real app, since the real `compose.e2e.yaml` doesn't exist here. Report this limitation clearly in your DONE report.

- [ ] **Step 3: Validate YAML again**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "valid YAML"
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat(ci): add ephemeral staging-deploy stage

Spins up the full Docker Compose stack inside the runner, smoke-tests it,
tears it down. No persistent cloud staging environment — Render's free
tier allows only one Key Value (Redis) instance per workspace, so a
second always-on environment isn't viable without cost or sharing prod's
Redis. Depends on compose.e2e.yaml, which lands on dev/web-app-scaffold
(built in parallel) — not yet integration-tested end-to-end."
```

---

## Task 3: Stage 5 — prod deploy manual gate

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing new.
- Produces: a `prod-deploy` job, `needs: staging-deploy`, gated by a GitHub Environment.

- [ ] **Step 1: Add the prod-deploy job**

Append to `.github/workflows/ci.yml`:

```yaml
  prod-deploy:
    name: "5. Production Deploy"
    needs: staging-deploy
    runs-on: ubuntu-latest
    # This job only runs after a human approves it in the GitHub Actions UI.
    # One-time repo setup required (Settings > Environments > New environment):
    #   1. Create an environment named "production".
    #   2. Under "Deployment protection rules", add yourself as a required reviewer.
    #   3. Without this setup, GitHub will run the job immediately with no gate —
    #      the environment must exist and have a reviewer configured for the
    #      pause-for-approval behavior to take effect.
    environment: production
    steps:
      - run: |
          echo "Render auto-deploys on push to master via its own GitHub webhook."
          echo "This job exists to make the pipeline stage explicit and to gate"
          echo "it behind manual approval — it does not itself trigger a deploy."
```

- [ ] **Step 2: Validate YAML**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "valid YAML"
```

- [ ] **Step 3: Re-run the full local verification from Task 1 Step 2 to confirm nothing regressed**

```bash
npm run typecheck && npm run lint && npm run test && echo "all green"
```

Expected: `all green`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat(ci): add manual-gate prod-deploy stage

Requires a GitHub Environment named 'production' with a required reviewer
(one-time manual repo setup, documented in the job's comment block) — the
job pauses for human approval in the Actions UI rather than running
automatically. Render's own webhook is the actual deploy trigger once
master changes; this job's purpose is the approval gate, not the deploy
itself."
```

---

## Self-Review

**Spec coverage:** all 5 stages from `docs/architecture/deployment-architecture.md` are implemented as jobs 1-5. Trigger is `pull_request`-only per the corrected diagram (no `push:` key anywhere in the workflow).

**Known limitation, by design:** stage 4 cannot be fully integration-tested in this isolated worktree because `compose.e2e.yaml` is being built in parallel on a different branch. This is flagged in Task 2's steps and its commit message rather than hidden — full end-to-end verification happens when the two branches are reconciled by the human.

**No placeholders left unresolved:** the one `# TODO` comment (Task 1, `npm run build`) is intentional and explained — it depends on `apps/web` existing, which is out of scope for this plan.

---
name: docker-compose-rebuild
description: >-
  Use on the Blog-Chat-app repo whenever a code edit (bug fix or new feature) does not show up in the
  running app, or as the FIRST troubleshooting step when the user says a fix "didn't work," they "don't
  see the change," or the UI/API still shows old behavior after edits. Docker containers here bake source
  at build time and serve stale code, so this skill asks permission and then rebuilds the compose stack so
  the edits actually take effect. Trigger it before debugging the code itself when changes seem to have no visible effect.
---

# Docker Compose Rebuild

## Why this exists

On this repo the dev stack runs in Docker. A container started with `up -d` **freezes the app code at
image-build time** — editing a file afterward and running `restart` keeps serving the code baked into the
image (see the `docker-compose-dev-sync-gotcha` project memory, confirmed during P2 signup debugging). So
when a bug fix or new feature "doesn't work," the most common cause is not the code — it's that the running
container never picked up the edit.

**Rule of thumb:** if the user just changed code and the change isn't visible, suspect a stale container
*before* you re-read the logic. Rebuilding is the cheap first move; debugging code that's correct but not
running is wasted effort.

## When to trigger

- The user reports that a recent bug fix or new feature has no visible effect.
- "I don't see my changes," "the fix didn't work," "still shows the old behavior," "nothing changed."
- Right after you (or the user) edit source while the stack is already running.
- As the **first** step of troubleshooting a "my change isn't showing" symptom, before diving into the code.

## What to do

1. **Ask for permission first.** A full `--no-cache` rebuild is slow, and `up --watch` runs in the
   foreground and takes over the terminal. Never rebuild silently — confirm with the user, e.g.:
   > "Your change may not be showing because the container is serving stale code. Want me to rebuild the
   > compose stack? This does a clean `--no-cache` build and can take a few minutes."

2. **Only after they agree**, run these two commands from the **repo root** (not from `infra/`):

   ```bash
   docker compose --project-directory . -f infra/compose.yaml build --no-cache
   docker compose --project-directory . -f infra/compose.yaml up --watch
   ```

   - `--project-directory .` is mandatory — the compose file lives in `infra/` but its `context` /
     `develop.watch` / secrets paths are written relative to the repo root; Compose resolves them wrong
     without it.
   - `up --watch` is long-running and blocks the terminal (it keeps syncing edits live). Run it in the
     background if you need the terminal back, and tell the user it stays running.

3. If the user only wants the change picked up (not a full clean rebuild), a lighter option is a targeted
   rebuild of the one changed service — `docker compose --project-directory . -f infra/compose.yaml up -d --build <service>`
   — or just `docker compose watch` (what `npm run dev` does), which syncs edits live without the slow
   `--no-cache` pass. Offer this when a full clean rebuild is overkill.

## After rebuilding

Confirm the change is actually present before assuming success — e.g. reload the page, hit the endpoint, or
`docker compose exec <service> grep` for the edited string inside the container. Don't declare it fixed until
you've seen the new behavior.

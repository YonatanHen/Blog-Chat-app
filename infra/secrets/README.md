# infra/secrets/

Docker Compose secrets for `infra/compose.yaml` (dev) and `infra/compose.e2e.yaml` (CI). Each file holds one
value, mounted into the container at `/run/secrets/<name>` and read via the `SESSION_SECRET_FILE`
convention in `apps/server/src/lib/env.ts`.

The actual `*.txt` files are gitignored — never commit a secret file, even a throwaway one. Each
directory ships a `*.txt.example` template instead; copy it before running Compose (from the repo root):

```bash
cp infra/secrets/dev/session_secret.txt.example infra/secrets/dev/session_secret.txt
cp infra/secrets/e2e/session_secret.txt.example infra/secrets/e2e/session_secret.txt
```

The example values are synthetic and public on purpose — `dev`/`e2e` mongo and redis run
unauthenticated on an isolated Compose network with no real user data, so there's nothing to
protect there regardless. Real production secrets are never here; they live in the Render
dashboard (`infra/render.yaml` uses `sync: false`).

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import express from 'express'

/**
 * Serves the built SPA and returns index.html for any non-API route, so a
 * refresh on a client route survives (spec §11: one origin, no CORS anywhere).
 *
 * Registered AFTER the API routers and BEFORE the 404 handler.
 */
export function mountStatic(app: express.Express, clientDist: string): void {
  const dir = resolve(clientDist)
  if (!existsSync(dir)) {
    // The P1 default: there is no client yet. Serving the API alone is correct.
    console.warn(`No client build at ${dir} — serving the API only.`)
    return
  }

  app.use(express.static(dir, { index: false }))

  app.get('/{*splat}', (req, res, next) => {
    // Never let the SPA answer for the API. Without this guard an unknown API
    // route returns index.html with a 200, and a fetch() gets HTML where it
    // expected JSON — the single most confusing failure mode in this topology.
    if (req.path.startsWith('/api/')) {
      next()
      return
    }
    res.sendFile(join(dir, 'index.html'))
  })
}

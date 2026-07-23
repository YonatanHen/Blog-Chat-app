import { DEBUG } from '../lib/constants.js'

export class ApiError extends Error {
  readonly status: number
  readonly fields: Record<string, string[]>

  constructor(status: number, message: string, fields: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T | undefined> {
  const method = init?.method || 'GET'

  if (DEBUG) {
    const body = init?.body ? JSON.parse(init.body as string) : null
    console.log(`[API] ${method} ${path}`, body)
  }

  // A JSON body needs the matching Content-Type, or express.json() skips
  // parsing and req.body arrives as {} — every field then reads as "Required".
  const headers =
    init?.body !== undefined
      ? { 'Content-Type': 'application/json', ...init?.headers }
      : init?.headers

  const response = await fetch(path, { ...init, headers, credentials: 'include' })

  if (DEBUG) console.info(`[API Response] ${method} ${path} → ${response.status}`)

  if (!response.ok) {
    const body = await response.json()
    console.error(`[API Error] ${method} ${path} - ${response.status}:`, body.error)
    throw new ApiError(response.status, body.error.message, body.error.fields || {})
  }

  if (response.status === 204) return undefined

  const data = await response.json()
  return data
}

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
  const response = await fetch(path, { ...init, credentials: 'include' })

  if (!response.ok) {
    const body = await response.json()
    throw new ApiError(response.status, body.error.message, body.error.fields || {})
  }

  if (response.status === 204) return undefined

  return response.json()
}

export class UnauthorizedError extends Error {
  constructor(message = 'You must be signed in.') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to do that.') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found.') {
    super(message)
    this.name = 'NotFoundError'
  }
}

/** 400 — input failed schema validation. `fields` mirrors Zod's flatten().fieldErrors. */
export class ValidationError extends Error {
  readonly fields: Record<string, string[]>
  constructor(message = 'Invalid input.', fields: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ValidationError'
    this.fields = fields
  }
}

/** 409 — the request is well-formed but conflicts with existing state (duplicate username/email). */
export class ConflictError extends Error {
  constructor(message = 'That already exists.') {
    super(message)
    this.name = 'ConflictError'
  }
}

/**
 * 403 — the demo deployment has reached a fixed capacity.
 *
 * 403 rather than 503: 503 is semantically closer to "at capacity" and would
 * permit Retry-After, but it reads as *broken* to a visitor and trips uptime
 * monitoring. This is a policy refusal of a well-formed, well-authenticated
 * request. A distinct class rather than reusing ForbiddenError keeps the case
 * separable in tests and logs.
 */
export class DemoLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DemoLimitError'
  }
}

/** 503 — an optional dependency this route needs is not configured on this deployment. */
export class ServiceUnavailableError extends Error {
  constructor(message = 'That feature is not available on this deployment.') {
    super(message)
    this.name = 'ServiceUnavailableError'
  }
}

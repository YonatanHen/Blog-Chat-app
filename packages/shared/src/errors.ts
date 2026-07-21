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

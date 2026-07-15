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

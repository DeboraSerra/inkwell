// Errors thrown by services. Controllers turn them into HTTP statuses or form
// messages using `code`, so services never deal with transport concerns.

export type DomainErrorCode = "NOT_FOUND" | "INVALID" | "UNAUTHORIZED";

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: DomainErrorCode,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Not found") {
    super(message, "NOT_FOUND");
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, "INVALID");
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Unauthorized") {
    super(message, "UNAUTHORIZED");
  }
}

const HTTP_STATUS: Record<DomainErrorCode, number> = {
  NOT_FOUND: 404,
  INVALID: 422,
  UNAUTHORIZED: 401,
};

// For route handlers: maps a domain error to a JSON response; rethrows
// anything unexpected so it surfaces as a 500.
export function domainErrorResponse(error: unknown) {
  if (!(error instanceof DomainError)) throw error;
  return Response.json({ error: error.message }, { status: HTTP_STATUS[error.code] });
}

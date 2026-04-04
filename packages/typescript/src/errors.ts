/** Base error for all Kredit SDK errors. */
export class KreditError extends Error {
  readonly statusCode: number | undefined;
  readonly body: Record<string, unknown>;

  constructor(
    message: string,
    options?: { statusCode?: number; body?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "KreditError";
    this.statusCode = options?.statusCode;
    this.body = options?.body ?? {};
  }
}

/** Raised when authentication fails (401/403). */
export class AuthError extends KreditError {
  constructor(
    message = "Invalid or missing API key",
    body?: Record<string, unknown>,
  ) {
    super(message, { statusCode: 401, body });
    this.name = "AuthError";
  }
}

/** Raised when a risk check denies the action. */
export class RiskDenied extends KreditError {
  constructor(
    message = "Action denied by risk check",
    body?: Record<string, unknown>,
  ) {
    super(message, { statusCode: 403, body });
    this.name = "RiskDenied";
  }
}

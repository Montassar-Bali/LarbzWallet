import "server-only";

export type AdminErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "LICENSE_REVOKED"
  | "LICENSE_EXPIRED"
  | "SERVER_NOT_CONFIGURED"
  | "DATABASE_ERROR";

export class AdminServiceError extends Error {
  constructor(
    public readonly code: AdminErrorCode,
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AdminServiceError";
  }
}

export function asAdminServiceError(error: unknown) {
  if (error instanceof AdminServiceError) return error;
  const errorType = error instanceof Error ? error.name : typeof error;
  console.error(`Admin service request failed (${errorType})`);
  return new AdminServiceError("DATABASE_ERROR", 500, "The request could not be completed.");
}

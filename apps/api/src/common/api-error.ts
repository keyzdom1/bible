import { HttpException, HttpStatus } from "@nestjs/common";

/** HTTP error carrying the stable machine-readable `code` used by the API contract. */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }

  static unauthorized(message = "Authentication required"): ApiError {
    return new ApiError(HttpStatus.UNAUTHORIZED, "unauthorized", message);
  }

  static forbidden(code: string, message: string): ApiError {
    return new ApiError(HttpStatus.FORBIDDEN, code, message);
  }

  static notFound(message: string): ApiError {
    return new ApiError(HttpStatus.NOT_FOUND, "not-found", message);
  }

  static badRequest(code: string, message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(HttpStatus.BAD_REQUEST, code, message, details);
  }

  static conflict(code: string, message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(HttpStatus.CONFLICT, code, message, details);
  }

  static unavailable(code: string, message: string): ApiError {
    return new ApiError(HttpStatus.SERVICE_UNAVAILABLE, code, message);
  }
}

/** 409 used for concurrent note edits, matching the Conflict schema in `docs/openapi.yaml`. */
export class ConflictError extends HttpException {
  constructor(
    code: string,
    message: string,
    readonly conflictId: string,
  ) {
    super({ code, message, conflictId }, HttpStatus.CONFLICT);
  }
}

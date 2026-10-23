import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodError } from "zod";

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/** Normalizes every failure to the `{ code, message, details? }` shape in the OpenAPI spec. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();

    if (exception instanceof ZodError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        code: "validation-failed",
        message: "Request validation failed",
        details: exception.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      } satisfies ErrorBody);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      // Structured single-line JSON so CloudWatch metric filters can alarm on
      // authentication failures (spec §9) once logs are streamed from Elastic Beanstalk.
      if ((status === 401 || status === 403) && process.env.NODE_ENV !== "test") {
        console.warn(
          JSON.stringify({
            type: "auth-failure",
            status,
            method: request.method,
            path: request.originalUrl,
            at: new Date().toISOString(),
          }),
        );
      }
      if (typeof payload === "object" && payload !== null && "code" in payload) {
        response.status(status).json(payload);
        return;
      }
      const message =
        typeof payload === "string"
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      response.status(status).json({
        code: status === 404 ? "not-found" : "request-failed",
        message: Array.isArray(message) ? message.join(", ") : message,
      } satisfies ErrorBody);
      return;
    }

    const message = exception instanceof Error ? exception.message : "Internal server error";
    if (process.env.NODE_ENV !== "test") {
      console.error(`Unhandled error on ${request.method} ${request.originalUrl}`, exception);
    }
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: "internal-error",
      message: process.env.NODE_ENV === "production" ? "Internal server error" : message,
    } satisfies ErrorBody);
  }
}

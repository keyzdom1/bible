import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { AuthedUser } from "./auth.types";

export interface AuthedRequest extends Request {
  user?: AuthedUser;
}

/** Injects the authenticated user resolved by AuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthedUser => {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user) throw new Error("CurrentUser used on a public route");
    return request.user;
  },
);

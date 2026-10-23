import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { ApiError } from "../common/api-error";
import { APP_CONFIG, type AppConfig } from "../config";
import type { AuthedUser } from "./auth.types";
import type { AuthedRequest } from "./current-user.decorator";

export function isAdmin(user: Pick<AuthedUser, "email" | "groups">, config: AppConfig): boolean {
  return (
    config.adminEmails.includes(user.email.toLowerCase()) ||
    user.groups.includes("holyword-admin") ||
    user.groups.includes("admin")
  );
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const user = request.user;
    if (!user) throw ApiError.unauthorized();
    if (!isAdmin(user, this.config)) {
      throw ApiError.forbidden("forbidden", "Administrator access required");
    }
    return true;
  }
}

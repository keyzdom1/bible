import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiError } from "../common/api-error";
import { APP_CONFIG, type AppConfig } from "../config";
import { AuthService } from "./auth.service";
import type { AuthedRequest } from "./current-user.decorator";
import { IS_PUBLIC } from "./public.decorator";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const cookies = request.cookies as Record<string, string> | undefined;
    const cookieToken = cookies?.[this.config.sessionCookieName];
    if (cookieToken) {
      const session = await this.auth.resolveCookieSession(cookieToken);
      if (!session) throw ApiError.unauthorized("Session expired or invalid");
      request.user = {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
        groups: session.groups,
        expiresAt: session.expiresAt.toISOString(),
      };
      return true;
    }

    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ")) {
      const session = await this.auth.resolveBearer(authorization.slice("Bearer ".length));
      if (!session) throw ApiError.unauthorized("Access token expired or invalid");
      request.user = {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
        groups: session.groups,
        expiresAt: session.expiresAt.toISOString(),
      };
      return true;
    }

    throw ApiError.unauthorized();
  }
}

import { Controller, Delete, Get, HttpCode, Inject, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { ApiError } from "../common/api-error";
import { ZodBody } from "../common/zod-body";
import { APP_CONFIG, type AppConfig } from "../config";
import { AuthService } from "./auth.service";
import type { AuthedUser } from "./auth.types";
import { CurrentUser } from "./current-user.decorator";
import { Public } from "./public.decorator";
import { SessionService } from "./session.service";

const sessionRequestSchema = z.object({
  idToken: z.string().min(10, "An identity token is required"),
});

interface SessionDto {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly expiresAt: string;
}

@Controller("v1/auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post("session")
  @HttpCode(200)
  async createSession(
    @ZodBody(sessionRequestSchema) body: z.infer<typeof sessionRequestSchema>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionDto> {
    let session;
    try {
      session = await this.auth.exchange(body.idToken);
    } catch {
      throw ApiError.unauthorized("Identity token could not be verified");
    }
    response.cookie(this.config.sessionCookieName, session.token, this.sessions.cookieOptions());
    return {
      userId: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  @Get("session")
  getSession(@CurrentUser() user: AuthedUser): SessionDto {
    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      expiresAt: user.expiresAt,
    };
  }

  @Public()
  @Delete("session")
  @HttpCode(204)
  deleteSession(@Res({ passthrough: true }) response: Response): void {
    const { maxAge: _maxAge, ...options } = this.sessions.cookieOptions();
    response.clearCookie(this.config.sessionCookieName, options);
  }
}

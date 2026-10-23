import { Inject, Injectable } from "@nestjs/common";
import { SignJWT, jwtVerify } from "jose";
import { APP_CONFIG, type AppConfig } from "../config";
import type { SessionClaims } from "./auth.types";

export interface CreatedSession {
  readonly token: string;
  readonly expiresAt: Date;
}

@Injectable()
export class SessionService {
  private readonly key: Uint8Array;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.key = new TextEncoder().encode(config.sessionSecret);
  }

  async create(userId: string, email: string, groups: readonly string[]): Promise<CreatedSession> {
    const expiresAt = new Date(Date.now() + this.config.sessionTtlSeconds * 1000);
    const token = await new SignJWT({ email, groups })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { token, expiresAt };
  }

  async verify(token: string): Promise<SessionClaims> {
    const { payload } = await jwtVerify(token, this.key, { algorithms: ["HS256"] });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.exp !== "number"
    ) {
      throw new Error("Invalid session payload");
    }
    const groups = Array.isArray(payload.groups)
      ? payload.groups.filter((item): item is string => typeof item === "string")
      : [];
    return {
      userId: payload.sub,
      email: payload.email,
      groups,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  }

  cookieOptions(): {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
  } {
    return {
      httpOnly: true,
      secure: this.config.nodeEnv === "production",
      sameSite: "lax",
      path: "/",
      maxAge: this.config.sessionTtlSeconds * 1000,
    };
  }
}

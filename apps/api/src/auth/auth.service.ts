import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { users, type User } from "@holyword/db";
import { DatabaseService } from "../database/database.service";
import { SessionService } from "./session.service";
import { TOKEN_VERIFIER, type AccessIdentity, type TokenVerifier } from "./auth.types";

export interface AuthSession {
  readonly user: User;
  readonly token: string;
  readonly expiresAt: Date;
  readonly groups: readonly string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionService,
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
  ) {}

  async exchange(idToken: string): Promise<AuthSession> {
    const identity = await this.verifier.verifyIdToken(idToken);
    const now = new Date();
    const [user] = await this.database.db
      .insert(users)
      .values({
        cognitoSub: identity.cognitoSub,
        email: identity.email,
        displayName: identity.name ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.cognitoSub,
        set: {
          email: identity.email,
          displayName: identity.name ?? null,
          updatedAt: now,
        },
      })
      .returning();
    if (!user) throw new UnauthorizedException("Could not create session");
    const session = await this.sessions.create(user.id, user.email, identity.groups);
    return {
      user,
      token: session.token,
      expiresAt: session.expiresAt,
      groups: identity.groups,
    };
  }

  async resolveCookieSession(token: string): Promise<AuthSession | undefined> {
    let claims;
    try {
      claims = await this.sessions.verify(token);
    } catch {
      return undefined;
    }
    const [user] = await this.database.db
      .select()
      .from(users)
      .where(and(eq(users.id, claims.userId), isNull(users.deletedAt)))
      .limit(1);
    if (!user) return undefined;
    return { user, token, expiresAt: new Date(claims.expiresAt), groups: claims.groups };
  }

  async resolveBearer(bearerToken: string): Promise<AuthSession | undefined> {
    let identity: AccessIdentity;
    try {
      identity = await this.verifier.verifyAccessToken(bearerToken);
    } catch {
      return undefined;
    }
    const [user] = await this.database.db
      .select()
      .from(users)
      .where(and(eq(users.cognitoSub, identity.cognitoSub), isNull(users.deletedAt)))
      .limit(1);
    if (!user) return undefined;
    return {
      user,
      token: bearerToken,
      expiresAt: new Date(Date.now() + this.sessions.cookieOptions().maxAge),
      groups: identity.groups,
    };
  }
}

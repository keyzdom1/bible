import { Injectable } from "@nestjs/common";
import type { AccessIdentity, TokenVerifier, VerifiedIdentity } from "./auth.types";

const DEV_TOKEN_PATTERN = /^dev:([^\s@]+@[^\s@]+\.[^\s@]+)$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Local/test identity provider. Accepts `dev:<email>` as both an ID token and a
 * bearer token. Never enabled in production (see loadConfig).
 */
@Injectable()
export class DevTokenVerifier implements TokenVerifier {
  async verifyIdToken(token: string): Promise<VerifiedIdentity> {
    const match = DEV_TOKEN_PATTERN.exec(token.trim());
    if (!match) throw new Error("Invalid development token; expected dev:<email>");
    const email = match[1]!.toLowerCase();
    return {
      cognitoSub: `dev:${email}`,
      email,
      emailVerified: true,
      name: email.split("@")[0],
      groups: [],
    };
  }

  async verifyAccessToken(token: string): Promise<AccessIdentity> {
    const identity = await this.verifyIdToken(token);
    return { cognitoSub: identity.cognitoSub, groups: identity.groups };
  }
}

export function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

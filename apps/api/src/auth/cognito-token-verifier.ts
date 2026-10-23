import { Injectable } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { CognitoConfig } from "../config";
import type { AccessIdentity, TokenVerifier, VerifiedIdentity } from "./auth.types";

function groupsOf(payload: JWTPayload): readonly string[] {
  const value = payload["cognito:groups"];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Verifies Cognito ID tokens (session exchange) and access tokens (mobile bearer auth). */
@Injectable()
export class CognitoTokenVerifier implements TokenVerifier {
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly clientId: string;

  constructor(config: CognitoConfig) {
    this.issuer = `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
    this.clientId = config.clientId;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
  }

  async verifyIdToken(token: string): Promise<VerifiedIdentity> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: this.clientId,
    });
    if (payload.token_use !== "id") {
      throw new Error("Expected a Cognito ID token");
    }
    const email = payload.email;
    const sub = payload.sub;
    if (typeof email !== "string" || typeof sub !== "string") {
      throw new Error("Cognito ID token is missing email or subject");
    }
    return {
      cognitoSub: sub,
      email: email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === "string" ? payload.name : undefined,
      groups: groupsOf(payload),
    };
  }

  async verifyAccessToken(token: string): Promise<AccessIdentity> {
    const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer });
    if (payload.token_use !== "access" || payload.client_id !== this.clientId) {
      throw new Error("Expected a Cognito access token for this app client");
    }
    if (typeof payload.sub !== "string") {
      throw new Error("Cognito access token is missing a subject");
    }
    return { cognitoSub: payload.sub, groups: groupsOf(payload) };
  }
}

export interface VerifiedIdentity {
  readonly cognitoSub: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name?: string;
  readonly groups: readonly string[];
}

export interface AccessIdentity {
  readonly cognitoSub: string;
  readonly groups: readonly string[];
}

export interface AuthedUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly groups: readonly string[];
  readonly expiresAt: string;
}

export interface SessionClaims {
  readonly userId: string;
  readonly email: string;
  readonly groups: readonly string[];
  readonly expiresAt: string;
}

export interface TokenVerifier {
  verifyIdToken(token: string): Promise<VerifiedIdentity>;
  verifyAccessToken(token: string): Promise<AccessIdentity>;
}

export const TOKEN_VERIFIER = Symbol("TOKEN_VERIFIER");

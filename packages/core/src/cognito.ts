export interface CognitoConfig {
  readonly region: string;
  readonly clientId: string;
  /** Hosted-UI domain, for example `holyword.auth.us-east-1.amazoncognito.com`. */
  readonly domain?: string;
  /** Allowed callback; must be registered on the app client. */
  readonly redirectUri?: string;
}

export interface CognitoTokens {
  readonly accessToken: string;
  readonly idToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: string;
}

export interface CognitoSignUpResult {
  readonly userConfirmed: boolean;
  readonly destination: string | null;
}

export interface CognitoChallenge {
  readonly challengeName: "NEW_PASSWORD_REQUIRED";
  readonly session: string;
  readonly username: string;
}

export type CognitoFetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class CognitoError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CognitoError";
  }
}

interface AuthenticationResult {
  readonly AccessToken?: string;
  readonly IdToken?: string;
  readonly RefreshToken?: string;
  readonly ExpiresIn?: number;
}

interface CognitoResponse {
  readonly AuthenticationResult?: AuthenticationResult;
  readonly ChallengeName?: string;
  readonly Session?: string;
  readonly UserConfirmed?: boolean;
  readonly CodeDeliveryDetails?: { readonly Destination?: string };
}

function friendlyMessage(code: string, fallback: string): string {
  switch (code) {
    case "NotAuthorizedException":
      return "The email or password is incorrect.";
    case "UserNotConfirmedException":
      return "Confirm your email address before signing in.";
    case "UserNotFoundException":
      return "The email or password is incorrect.";
    case "UsernameExistsException":
      return "An account with that email already exists.";
    case "CodeMismatchException":
      return "That confirmation code is incorrect or has expired.";
    case "ExpiredCodeException":
      return "That confirmation code has expired. Request a new one.";
    case "LimitExceededException":
      return "Too many attempts. Wait a moment and try again.";
    case "InvalidPasswordException":
      return "Choose a stronger password that meets the account policy.";
    case "InvalidParameterException":
      return "Check the details you entered and try again.";
    default:
      return fallback;
  }
}

function tokensFrom(result: AuthenticationResult): CognitoTokens {
  if (!result.AccessToken || !result.IdToken) {
    throw new CognitoError("invalid-response", "Cognito did not return usable tokens", 502);
  }
  const expiresIn = result.ExpiresIn ?? 3600;
  return {
    accessToken: result.AccessToken,
    idToken: result.IdToken,
    refreshToken: result.RefreshToken ?? null,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

/**
 * Minimal Cognito user-pool client using the public JSON API. Password sign-in
 * requires the app client to allow `USER_PASSWORD_AUTH`; hosted UI and social
 * login use the authorization endpoint and return tokens in the URL fragment.
 */
export class CognitoAuthClient {
  private readonly endpoint: string;
  private readonly fetchImpl: CognitoFetchLike;

  constructor(
    private readonly config: CognitoConfig,
    options: { readonly fetch?: CognitoFetchLike } = {},
  ) {
    this.endpoint = `https://cognito-idp.${config.region}.amazonaws.com/`;
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async signIn(email: string, password: string): Promise<CognitoTokens> {
    const response = await this.call<CognitoResponse>("InitiateAuth", {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: this.config.clientId,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    });
    if (response.ChallengeName === "NEW_PASSWORD_REQUIRED" && response.Session) {
      const challenge: CognitoChallenge = {
        challengeName: "NEW_PASSWORD_REQUIRED",
        session: response.Session,
        username: email,
      };
      throw Object.assign(
        new CognitoError(
          "new-password-required",
          "Choose a new password to finish signing in.",
          409,
        ),
        { challenge },
      );
    }
    if (!response.AuthenticationResult) {
      throw new CognitoError("unsupported-challenge", "Cognito requires another sign-in step", 409);
    }
    return tokensFrom(response.AuthenticationResult);
  }

  async completeNewPassword(
    username: string,
    session: string,
    newPassword: string,
  ): Promise<CognitoTokens> {
    const response = await this.call<CognitoResponse>("RespondToAuthChallenge", {
      ChallengeName: "NEW_PASSWORD_REQUIRED",
      ClientId: this.config.clientId,
      Session: session,
      ChallengeResponses: { USERNAME: username, NEW_PASSWORD: newPassword },
    });
    if (!response.AuthenticationResult) {
      throw new CognitoError("unsupported-challenge", "Cognito requires another sign-in step", 409);
    }
    return tokensFrom(response.AuthenticationResult);
  }

  async refresh(refreshToken: string): Promise<CognitoTokens> {
    const response = await this.call<CognitoResponse>("InitiateAuth", {
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: this.config.clientId,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    });
    if (!response.AuthenticationResult) {
      throw new CognitoError("refresh-failed", "The session could not be refreshed", 401);
    }
    const tokens = tokensFrom(response.AuthenticationResult);
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
  }

  async signUp(email: string, password: string, name?: string): Promise<CognitoSignUpResult> {
    const attributes = [{ Name: "email", Value: email }];
    if (name?.trim()) attributes.push({ Name: "name", Value: name.trim() });
    const response = await this.call<CognitoResponse>("SignUp", {
      ClientId: this.config.clientId,
      Username: email,
      Password: password,
      UserAttributes: attributes,
    });
    return {
      userConfirmed: response.UserConfirmed ?? false,
      destination: response.CodeDeliveryDetails?.Destination ?? null,
    };
  }

  async confirmSignUp(email: string, code: string): Promise<void> {
    await this.call("ConfirmSignUp", {
      ClientId: this.config.clientId,
      Username: email,
      ConfirmationCode: code,
    });
  }

  async resendConfirmationCode(email: string): Promise<void> {
    await this.call("ResendConfirmationCode", {
      ClientId: this.config.clientId,
      Username: email,
    });
  }

  async forgotPassword(email: string): Promise<void> {
    await this.call("ForgotPassword", {
      ClientId: this.config.clientId,
      Username: email,
    });
  }

  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
    await this.call("ConfirmForgotPassword", {
      ClientId: this.config.clientId,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
    });
  }

  hostedLoginUrl(options: { state?: string; identityProvider?: string } = {}): string | null {
    const domain = this.config.domain?.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (!domain || !this.config.redirectUri) return null;
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "token",
      scope: "openid email profile",
      redirect_uri: this.config.redirectUri,
    });
    if (options.state) params.set("state", options.state);
    if (options.identityProvider) params.set("identity_provider", options.identityProvider);
    return `https://${domain}/oauth2/authorize?${params.toString()}`;
  }

  /** Reads the implicit-flow token fragment returned by the hosted UI. */
  parseRedirect(hash: string): CognitoTokens | null {
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!raw) return null;
    const params = new URLSearchParams(raw);
    const accessToken = params.get("access_token");
    const idToken = params.get("id_token");
    if (!accessToken || !idToken) return null;
    const expiresIn = Number(params.get("expires_in") ?? "3600");
    return {
      accessToken,
      idToken,
      refreshToken: null,
      expiresAt: new Date(
        Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
      ).toISOString(),
    };
  }

  private async call<T = Record<string, unknown>>(
    action: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-amz-json-1.1",
        "x-amz-target": `AWSCognitoIdentityProviderService.${action}`,
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    if (text) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsed = { message: text };
      }
    }
    if (!response.ok) {
      const rawType = typeof parsed.__type === "string" ? parsed.__type : "CognitoError";
      const code = rawType.includes("#") ? rawType.slice(rawType.lastIndexOf("#") + 1) : rawType;
      const fallback =
        typeof parsed.message === "string"
          ? parsed.message
          : `Cognito request failed (${response.status})`;
      throw new CognitoError(code, friendlyMessage(code, fallback), response.status);
    }
    return parsed as T;
  }
}

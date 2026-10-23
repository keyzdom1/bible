import { describe, expect, it, vi } from "vitest";
import { CognitoAuthClient } from "../src/cognito";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/x-amz-json-1.1" },
  });
}

const config = {
  region: "eu-west-2",
  clientId: "client-123",
  domain: "holyword.auth.eu-west-2.amazoncognito.com",
  redirectUri: "https://holyword.app/auth/callback",
};

describe("CognitoAuthClient", () => {
  it("signs in with USER_PASSWORD_AUTH and normalises tokens", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({
        AuthenticationResult: {
          AccessToken: "access",
          IdToken: "id",
          RefreshToken: "refresh",
          ExpiresIn: 120,
        },
      }),
    );
    const client = new CognitoAuthClient(config, { fetch: fetchMock });

    const tokens = await client.signIn("reader@example.com", "secret");

    expect(tokens).toMatchObject({ accessToken: "access", idToken: "id", refreshToken: "refresh" });
    expect(Date.parse(tokens.expiresAt)).toBeGreaterThan(Date.now());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://cognito-idp.eu-west-2.amazonaws.com/");
    expect(init?.headers).toMatchObject({
      "x-amz-target": "AWSCognitoIdentityProviderService.InitiateAuth",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: "client-123",
      AuthParameters: { USERNAME: "reader@example.com", PASSWORD: "secret" },
    });
  });

  it("keeps the refresh token when Cognito rotates access tokens", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ AuthenticationResult: { AccessToken: "new", IdToken: "new-id", ExpiresIn: 60 } }),
    );
    const client = new CognitoAuthClient(config, { fetch: fetchMock });
    const tokens = await client.refresh("old-refresh");
    expect(tokens.refreshToken).toBe("old-refresh");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      AuthFlow: "REFRESH_TOKEN_AUTH",
    });
  });

  it("maps Cognito errors to safe messages", async () => {
    const fetchMock = vi.fn(async () =>
      json({ __type: "NotAuthorizedException", message: "Incorrect username or password." }, 400),
    );
    const client = new CognitoAuthClient(config, { fetch: fetchMock });
    await expect(client.signIn("reader@example.com", "bad")).rejects.toMatchObject({
      name: "CognitoError",
      code: "NotAuthorizedException",
      message: "The email or password is incorrect.",
      status: 400,
    });
  });

  it("supports registration and password reset calls", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({ UserConfirmed: false, CodeDeliveryDetails: { Destination: "r***@example.com" } }),
      )
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({}));
    const client = new CognitoAuthClient(config, { fetch: fetchMock });

    await expect(client.signUp("reader@example.com", "Secret123!", "Reader")).resolves.toEqual({
      userConfirmed: false,
      destination: "r***@example.com",
    });
    await client.confirmSignUp("reader@example.com", "123456");
    await client.forgotPassword("reader@example.com");
    await client.confirmForgotPassword("reader@example.com", "654321", "NewSecret123!");

    const targets = fetchMock.mock.calls.map((call) => call[1]?.headers);
    expect(targets.map((headers) => (headers as Record<string, string>)["x-amz-target"])).toEqual([
      "AWSCognitoIdentityProviderService.SignUp",
      "AWSCognitoIdentityProviderService.ConfirmSignUp",
      "AWSCognitoIdentityProviderService.ForgotPassword",
      "AWSCognitoIdentityProviderService.ConfirmForgotPassword",
    ]);
  });

  it("builds a hosted login URL and reads implicit-flow tokens", () => {
    const client = new CognitoAuthClient(config, { fetch: vi.fn() });
    const url = new URL(client.hostedLoginUrl({ state: "abc", identityProvider: "Google" })!);
    expect(url.host).toBe(config.domain);
    expect(url.searchParams.get("response_type")).toBe("token");
    expect(url.searchParams.get("identity_provider")).toBe("Google");
    expect(url.searchParams.get("state")).toBe("abc");
    expect(
      client.parseRedirect(
        "#access_token=access&id_token=id&expires_in=60&token_type=Bearer&state=abc",
      ),
    ).toMatchObject({ accessToken: "access", idToken: "id", refreshToken: null });
    expect(client.parseRedirect("#state=abc")).toBeNull();
  });

  it("throws a typed challenge when a new password is required", async () => {
    const fetchMock = vi.fn(async () =>
      json({ ChallengeName: "NEW_PASSWORD_REQUIRED", Session: "session" }),
    );
    const client = new CognitoAuthClient(config, { fetch: fetchMock });
    await expect(client.signIn("reader@example.com", "temporary")).rejects.toMatchObject({
      name: "CognitoError",
      code: "new-password-required",
      challenge: { session: "session" },
    });
  });
});

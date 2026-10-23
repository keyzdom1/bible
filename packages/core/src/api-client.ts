import {
  pullResponseSchema,
  type PullResponse,
  type PushResponse,
  type SyncOperation,
} from "./sync";
import type { ApiSchemas } from "./api";

export type ApiErrorBody = { code?: string; message?: string };

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: unknown;

  constructor(status: number, code: string, message: string, body: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly fetch?: FetchLike;
  /** `include` for cookie-authenticated web clients. */
  readonly credentials?: "include" | "omit" | "same-origin";
  /** Mobile clients can return a Cognito access token. */
  readonly getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
}

export interface DownloadTicketRequest {
  readonly deviceId: string;
  readonly platform?: "web" | "ios" | "android";
}

export interface SearchRequest {
  readonly q: string;
  readonly versionId?: string;
  readonly scope?: "version" | "all-versions" | "topic";
  readonly limit?: number;
}

function joinBase(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function queryString(values: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

/**
 * Framework-neutral REST client shared by the web and Expo apps.
 * Web sessions use httpOnly cookies (`credentials: "include"`); mobile clients
 * supply a Cognito bearer token through `getAccessToken`.
 */
export class HolyWordApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly credentials: "include" | "omit" | "same-origin";
  private readonly getAccessToken: ApiClientOptions["getAccessToken"];

  constructor(options: ApiClientOptions) {
    if (!options.baseUrl.trim()) throw new Error("An API base URL is required");
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.credentials = options.credentials ?? "omit";
    this.getAccessToken = options.getAccessToken;
  }

  async createSession(idToken: string): Promise<ApiSchemas["Session"]> {
    return this.request<ApiSchemas["Session"]>("POST", "/v1/auth/session", { idToken });
  }

  async getSession(): Promise<ApiSchemas["Session"]> {
    return this.request<ApiSchemas["Session"]>("GET", "/v1/auth/session");
  }

  async deleteSession(): Promise<void> {
    await this.request<void>("DELETE", "/v1/auth/session");
  }

  async listVersions(includeDisabled = false): Promise<ApiSchemas["Version"][]> {
    const response = await this.request<{ versions: ApiSchemas["Version"][] }>(
      "GET",
      `/v1/versions${queryString({ includeDisabled: includeDisabled || undefined })}`,
    );
    return response.versions;
  }

  async getDownloadTicket(
    versionId: string,
    request: DownloadTicketRequest,
  ): Promise<ApiSchemas["DownloadTicket"]> {
    return this.request<ApiSchemas["DownloadTicket"]>(
      "POST",
      `/v1/versions/${encodeURIComponent(versionId)}/download-ticket`,
      request,
    );
  }

  async getChapter(
    versionId: string,
    book: string,
    chapter: number,
  ): Promise<ApiSchemas["Chapter"]> {
    return this.request<ApiSchemas["Chapter"]>(
      "GET",
      `/v1/versions/${encodeURIComponent(versionId)}/books/${encodeURIComponent(book)}/chapters/${chapter}`,
    );
  }

  async search(request: SearchRequest): Promise<ApiSchemas["SearchResponse"]> {
    return this.request<ApiSchemas["SearchResponse"]>(
      "GET",
      `/v1/search${queryString({
        q: request.q,
        versionId: request.versionId,
        scope: request.scope,
        limit: request.limit,
      })}`,
    );
  }

  async listPlans(): Promise<ApiSchemas["ReadingPlan"][]> {
    const response = await this.request<{ items: ApiSchemas["ReadingPlan"][] }>("GET", "/v1/plans");
    return response.items;
  }

  async getPlan(planId: string): Promise<ApiSchemas["ReadingPlan"]> {
    return this.request<ApiSchemas["ReadingPlan"]>(
      "GET",
      `/v1/plans/${encodeURIComponent(planId)}`,
    );
  }

  async listPlanProgress(planId: string): Promise<ApiSchemas["PlanProgress"][]> {
    const response = await this.request<{ items: ApiSchemas["PlanProgress"][] }>(
      "GET",
      `/v1/plans/${encodeURIComponent(planId)}/progress`,
    );
    return response.items;
  }

  async deleteAccount(): Promise<void> {
    await this.request<void>("DELETE", "/v1/account");
  }

  async exportAccount(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("GET", "/v1/account/export");
  }

  async push(deviceId: string, ops: readonly SyncOperation[]): Promise<PushResponse> {
    return this.request<PushResponse>("POST", "/v1/sync/push", { deviceId, ops });
  }

  async pull(cursor: number, limit = 200): Promise<PullResponse> {
    const raw = await this.request<unknown>(
      "GET",
      `/v1/sync/pull${queryString({ cursor, limit })}`,
    );
    return pullResponseSchema.parse(raw);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers = new Headers({ Accept: "application/json" });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (this.getAccessToken) {
      const token = await this.getAccessToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await this.fetchImpl(joinBase(this.baseUrl, path), {
      method,
      headers,
      credentials: this.credentials,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (response.status === 204) {
      if (!response.ok)
        throw new ApiClientError(response.status, "http-error", response.statusText, null);
      return undefined as T;
    }

    const text = await response.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) {
      const error = (parsed ?? {}) as ApiErrorBody;
      throw new ApiClientError(
        response.status,
        error.code ?? "http-error",
        error.message ?? `Request failed with status ${response.status}`,
        parsed,
      );
    }
    return parsed as T;
  }
}

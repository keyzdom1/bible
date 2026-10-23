import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface OpenApiDocument {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown> };
}

function load(): { document: OpenApiDocument; source: string } {
  const source = readFileSync(new URL("../../../docs/openapi.yaml", import.meta.url), "utf8");
  return { document: parse(source) as OpenApiDocument, source };
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

describe("OpenAPI contract", () => {
  const { document, source } = load();

  it("is OpenAPI 3.1", () => {
    expect(document.openapi).toMatch(/^3\.1\./);
  });

  it("covers every phase-2 endpoint", () => {
    const required = [
      "/v1/auth/session",
      "/v1/versions",
      "/v1/versions/{versionId}",
      "/v1/versions/{versionId}/download-ticket",
      "/v1/versions/{versionId}/books/{book}/chapters/{chapter}",
      "/v1/search",
      "/v1/bookmarks",
      "/v1/bookmarks/{id}",
      "/v1/highlights",
      "/v1/highlights/{id}",
      "/v1/notes",
      "/v1/notes/{id}",
      "/v1/folders",
      "/v1/folders/{id}",
      "/v1/plans",
      "/v1/plans/{planId}",
      "/v1/plans/{planId}/progress",
      "/v1/reading-progress",
      "/v1/preferences",
      "/v1/sync/push",
      "/v1/sync/pull",
      "/v1/account",
      "/v1/account/export",
      "/v1/admin/versions/{versionId}/enable",
      "/v1/admin/versions/{versionId}/disable",
      "/v1/admin/audit-log",
    ];
    for (const path of required) {
      expect(document.paths[path], path).toBeDefined();
    }
  });

  it("gives every operation an operationId and at least one response", () => {
    for (const [path, item] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(item)) {
        if (!HTTP_METHODS.includes(method)) continue;
        const op = operation as { operationId?: string; responses?: Record<string, unknown> };
        expect(op.operationId, `${method.toUpperCase()} ${path}`).toBeTruthy();
        expect(
          Object.keys(op.responses ?? {}).length,
          `${method.toUpperCase()} ${path}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("resolves every schema $ref", () => {
    const refs = [...source.matchAll(/\$ref: "#\/components\/schemas\/([A-Za-z0-9]+)"/g)].map(
      (match) => match[1]!,
    );
    expect(refs.length).toBeGreaterThan(20);
    for (const name of new Set(refs)) {
      expect(document.components.schemas[name], name).toBeDefined();
    }
  });

  it("documents licence policy fields on version responses", () => {
    const version = document.components.schemas.Version as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(version.required).toEqual(
      expect.arrayContaining(["licenceStatus", "copyright", "attribution"]),
    );
    expect(version.properties.licenceStatus).toBeDefined();
  });

  it("documents idempotent sync and conflict handling", () => {
    const push = document.paths["/v1/sync/push"]?.post as { responses: Record<string, unknown> };
    expect(push.responses["409"]).toBeDefined();
    const op = document.components.schemas.SyncOperation as { required: string[] };
    expect(op.required).toEqual(expect.arrayContaining(["opId", "hlc", "entity", "entityId"]));
  });
});

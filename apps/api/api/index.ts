import type { INestApplication } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../src/app-factory";

/**
 * Vercel function entry (files under `api/` become serverless functions).
 * NestJS runs on plain Express, so the initialized application instance can
 * answer requests directly. The promise is module-scoped: warm invocations
 * reuse one application and its database pool instead of rebuilding per
 * request, while cold starts pay the Nest bootstrap once.
 */
let application: Promise<INestApplication> | undefined;

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  application ??= createApp();
  const app = await application;
  const express = app.getHttpAdapter().getInstance() as (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void;
  express(request, response);
}

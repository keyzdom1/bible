import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { json, urlencoded } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { APP_CONFIG, type AppConfig } from "./config";
import { loadEnvironment } from "./load-env";

/**
 * Builds the fully configured Nest application without starting a listener.
 * The long-running server (main.ts, Elastic Beanstalk) and the serverless
 * function entry (api/index.ts, Vercel) share this factory so middleware,
 * CORS and proxy behaviour cannot drift between the two hosts.
 */
export async function createApp(): Promise<INestApplication> {
  loadEnvironment();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get<AppConfig>(APP_CONFIG);
  const instance = app.getHttpAdapter().getInstance() as {
    set: (name: string, value: unknown) => void;
  };
  instance.set("trust proxy", 1);

  app.use(helmet());
  app.use(cookieParser());
  app.use(json({ limit: "2mb" }));
  app.use(urlencoded({ extended: true, limit: "2mb" }));
  app.enableCors({
    origin: config.webOrigin,
    credentials: true,
  });
  app.enableShutdownHooks();

  return app;
}

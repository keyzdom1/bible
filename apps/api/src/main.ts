import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { json, urlencoded } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { APP_CONFIG, type AppConfig } from "./config";
import { loadEnvironment } from "./load-env";

async function bootstrap(): Promise<void> {
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

  await app.listen(config.port);
  console.log(`HolyWord API listening on http://localhost:${config.port}`);
}

void bootstrap();

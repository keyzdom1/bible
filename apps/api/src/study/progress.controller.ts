import { Controller, Get, Headers, Put } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthedUser } from "../auth/auth.types";
import { ZodBody } from "../common/zod-body";
import { preferenceInputSchema, readingProgressInputSchema } from "./schemas";
import { StudyService } from "./study.service";

@Controller("v1/reading-progress")
export class ReadingProgressController {
  constructor(private readonly study: StudyService) {}

  @Get()
  async list(@CurrentUser() user: AuthedUser): Promise<{ items: unknown[] }> {
    return { items: await this.study.listReadingProgress(user.id) };
  }

  @Put()
  async update(
    @CurrentUser() user: AuthedUser,
    @ZodBody(readingProgressInputSchema) body: z.infer<typeof readingProgressInputSchema>,
    @Headers("x-device-id") deviceId?: string,
  ): Promise<unknown> {
    return this.study.updateReadingProgress(user.id, body, deviceId);
  }
}

@Controller("v1/preferences")
export class PreferencesController {
  constructor(private readonly study: StudyService) {}

  @Get()
  async get(@CurrentUser() user: AuthedUser): Promise<unknown> {
    return this.study.getPreferences(user.id);
  }

  @Put()
  async update(
    @CurrentUser() user: AuthedUser,
    @ZodBody(preferenceInputSchema) body: z.infer<typeof preferenceInputSchema>,
    @Headers("x-device-id") deviceId?: string,
  ): Promise<unknown> {
    return this.study.updatePreferences(user.id, body, deviceId);
  }
}

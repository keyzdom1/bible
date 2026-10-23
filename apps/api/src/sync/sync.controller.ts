import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { pushRequestSchema, type PushRequest } from "@holyword/core";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-body";
import { SyncService, type PullResult } from "./sync.service";

const pullQuerySchema = z.object({
  cursor: z
    .string()
    .regex(/^\d+$/, "Cursor must be a non-negative integer")
    .default("0")
    .transform((value) => Number(value))
    .refine((value) => Number.isSafeInteger(value), "Cursor is too large"),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

@Controller("v1/sync")
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post("push")
  @HttpCode(200)
  async push(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(pushRequestSchema)) body: PushRequest,
  ) {
    return this.sync.push(user.id, body);
  }

  @Get("pull")
  async pull(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(pullQuerySchema))
    query: { cursor: number; limit: number },
  ): Promise<PullResult> {
    return this.sync.pull(user.id, query.cursor, query.limit);
  }
}

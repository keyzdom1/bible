import { Controller, Get, Headers, Param, Put } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthedUser } from "../auth/auth.types";
import { ApiError } from "../common/api-error";
import { ZodBody } from "../common/zod-body";
import { planProgressInputSchema } from "./schemas";
import { StudyService } from "./study.service";

const planIdSchema = z.uuid();

function planIdOf(value: string): string {
  const parsed = planIdSchema.safeParse(value);
  if (!parsed.success) throw ApiError.badRequest("invalid-plan", "Plan id must be a UUID");
  return parsed.data;
}

@Controller("v1/plans")
export class PlansController {
  constructor(private readonly study: StudyService) {}

  @Get()
  async list(): Promise<{ items: unknown[] }> {
    return { items: await this.study.listPlans() };
  }

  @Get(":planId")
  async detail(@Param("planId") planId: string): Promise<unknown> {
    return this.study.getPlan(planIdOf(planId));
  }

  @Get(":planId/progress")
  async progress(
    @CurrentUser() user: AuthedUser,
    @Param("planId") planId: string,
  ): Promise<{ items: unknown[] }> {
    return { items: await this.study.listPlanProgress(user.id, planIdOf(planId)) };
  }

  @Put(":planId/progress")
  async updateProgress(
    @CurrentUser() user: AuthedUser,
    @Param("planId") planId: string,
    @ZodBody(planProgressInputSchema) body: z.infer<typeof planProgressInputSchema>,
    @Headers("x-device-id") deviceId?: string,
  ): Promise<unknown> {
    return this.study.updatePlanProgress(user.id, planIdOf(planId), body, deviceId);
  }
}

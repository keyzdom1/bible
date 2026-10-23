import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { licencePolicySchema } from "@holyword/core";
import { AdminGuard } from "../auth/admin.guard";
import type { AuthedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodBody, ZodValidationPipe } from "../common/zod-body";
import { AdminService, type AuditEntryDto } from "./admin.service";

const enableSchema = z.object({
  versionCode: z.number().int().positive(),
  packageKey: z.string().min(1).optional(),
  checksum: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "Expected a lowercase hex SHA-256")
    .optional(),
  policy: licencePolicySchema,
});

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

@Controller("v1/admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post("versions/:versionId/enable")
  @HttpCode(200)
  async enable(
    @CurrentUser() user: AuthedUser,
    @Param("versionId") versionId: string,
    @ZodBody(enableSchema) body: z.infer<typeof enableSchema>,
  ): Promise<unknown> {
    return this.admin.enableVersion(versionId, body, user);
  }

  @Post("versions/:versionId/disable")
  @HttpCode(200)
  async disable(
    @CurrentUser() user: AuthedUser,
    @Param("versionId") versionId: string,
  ): Promise<unknown> {
    return this.admin.disableVersion(versionId, user);
  }

  @Get("audit-log")
  async auditLog(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: { limit: number },
  ): Promise<{ items: AuditEntryDto[] }> {
    return { items: await this.admin.listAuditLog(query.limit) };
  }
}

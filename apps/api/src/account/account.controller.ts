import { Controller, Delete, Get, HttpCode } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthedUser } from "../auth/auth.types";
import { AccountService } from "./account.service";

@Controller("v1/account")
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Delete()
  @HttpCode(202)
  async remove(@CurrentUser() user: AuthedUser): Promise<void> {
    await this.account.delete(user.id);
  }

  @Get("export")
  async export(@CurrentUser() user: AuthedUser): Promise<Record<string, unknown>> {
    return this.account.export(user.id);
  }
}

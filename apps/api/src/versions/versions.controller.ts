import { Controller, Get, Headers, HttpCode, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { isBookCode } from "@holyword/core";
import { ApiError } from "../common/api-error";
import { ZodBody } from "../common/zod-body";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthedUser } from "../auth/auth.types";
import { ContentService, type ChapterDto, type VersionDto } from "../content/content.service";
import { DownloadTicketService, type DownloadTicketDto } from "./download-ticket.service";

const downloadTicketSchema = z.object({
  deviceId: z.uuid(),
  platform: z.enum(["web", "ios", "android"]).optional(),
});

@Controller("v1/versions")
export class VersionsController {
  constructor(
    private readonly content: ContentService,
    private readonly tickets: DownloadTicketService,
  ) {}

  @Get()
  async listVersions(
    @Query("includeDisabled") includeDisabled?: string,
  ): Promise<{ versions: VersionDto[] }> {
    return {
      versions: await this.content.listVersions(includeDisabled === "true"),
    };
  }

  @Get(":versionId")
  async getVersion(@Param("versionId") versionId: string): Promise<VersionDto> {
    const row = await this.content.getVersionRow(versionId);
    if (!row) throw ApiError.notFound(`Bible version "${versionId}" was not found`);
    return this.content.toDto(row);
  }

  @Get(":versionId/books/:book/chapters/:chapter")
  async getChapter(
    @Param("versionId") versionId: string,
    @Param("book") book: string,
    @Param("chapter") chapter: string,
  ): Promise<ChapterDto> {
    if (!/^[A-Z1-3]{3}$/.test(book) || !isBookCode(book)) {
      throw ApiError.badRequest("invalid-book", "Unknown book code");
    }
    const chapterNumber = Number(chapter);
    if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
      throw ApiError.badRequest("invalid-chapter", "Chapter must be a positive integer");
    }
    return this.content.getChapter(versionId, book, chapterNumber);
  }

  @Post(":versionId/download-ticket")
  @HttpCode(200)
  async createDownloadTicket(
    @CurrentUser() user: AuthedUser,
    @Param("versionId") versionId: string,
    @ZodBody(downloadTicketSchema) body: z.infer<typeof downloadTicketSchema>,
    @Headers("cloudfront-viewer-country") region?: string,
  ): Promise<DownloadTicketDto> {
    return this.tickets.issue(user.id, versionId, { ...body, region });
  }
}

import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthedUser } from "../auth/auth.types";
import { ZodBody } from "../common/zod-body";
import {
  bookmarkInputSchema,
  folderInputSchema,
  highlightInputSchema,
  noteInputSchema,
  updatedSinceSchema,
} from "./schemas";
import { StudyService } from "./study.service";

function since(value: string | undefined): Date | undefined {
  return updatedSinceSchema.parse(value);
}

@Controller("v1/bookmarks")
export class BookmarksController {
  constructor(private readonly study: StudyService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthedUser,
    @Query("updatedSince") updatedSince?: string,
  ): Promise<{ items: unknown[] }> {
    return { items: await this.study.listBookmarks(user.id, since(updatedSince)) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthedUser,
    @ZodBody(bookmarkInputSchema) body: z.infer<typeof bookmarkInputSchema>,
    @Headers("x-device-id") deviceId?: string,
  ): Promise<unknown> {
    return this.study.createBookmark(user.id, body, deviceId);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: AuthedUser,
    @Param("id") id: string,
    @ZodBody(bookmarkInputSchema) body: z.infer<typeof bookmarkInputSchema>,
    @Headers("x-device-id") deviceId?: string,
  ): Promise<unknown> {
    return this.study.updateBookmark(user.id, id, body, deviceId);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthedUser,
    @Param("id") id: string,
    @Headers("x-device-id") deviceId?: string,
  ): Promise<void> {
    await this.study.deleteBookmark(user.id, id, deviceId);
  }
}

@Controller("v1/highlights")
export class HighlightsController {
  constructor(private readonly study: StudyService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthedUser,
    @Query("updatedSince") updatedSince?: string,
  ): Promise<{ items: unknown[] }> {
    return { items: await this.study.listHighlights(user.id, since(updatedSince)) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthedUser,
    @ZodBody(highlightInputSchema) body: z.infer<typeof highlightInputSchema>,
    @Headers("x-device-id") deviceId?: string,
  ): Promise<unknown> {
    return this.study.createHighlight(user.id, body, deviceId);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: AuthedUser,
    @Param("id") id: string,
    @ZodBody(highlightInputSchema) body: z.infer<typeof highlightInputSchema>,
    @Headers("x-device-id") deviceId?: string,
  ): Promise<unknown> {
    return this.study.updateHighlight(user.id, id, body, deviceId);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthedUser,
    @Param("id") id: string,
    @Headers("x-device-id") deviceId?: string,
  ): Promise<void> {
    await this.study.deleteHighlight(user.id, id, deviceId);
  }
}

@Controller("v1/notes")
export class NotesController {
  constructor(private readonly study: StudyService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthedUser,
    @Query("updatedSince") updatedSince?: string,
  ): Promise<{ items: unknown[] }> {
    return { items: await this.study.listNotes(user.id, since(updatedSince)) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthedUser,
    @ZodBody(noteInputSchema) body: z.infer<typeof noteInputSchema>,
    @Headers("x-device-id") deviceId?: string,
  ): Promise<unknown> {
    return this.study.createNote(user.id, body, deviceId);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: AuthedUser,
    @Param("id") id: string,
    @ZodBody(noteInputSchema) body: z.infer<typeof noteInputSchema>,
    @Headers("x-device-id") deviceId?: string,
  ): Promise<unknown> {
    return this.study.updateNote(user.id, id, body, deviceId);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthedUser,
    @Param("id") id: string,
    @Headers("x-device-id") deviceId?: string,
  ): Promise<void> {
    await this.study.deleteNote(user.id, id, deviceId);
  }
}

@Controller("v1/folders")
export class FoldersController {
  constructor(private readonly study: StudyService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthedUser,
    @Query("updatedSince") updatedSince?: string,
  ): Promise<{ items: unknown[] }> {
    return { items: await this.study.listFolders(user.id, since(updatedSince)) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthedUser,
    @ZodBody(folderInputSchema) body: z.infer<typeof folderInputSchema>,
    @Headers("x-device-id") deviceId?: string,
  ): Promise<unknown> {
    return this.study.createFolder(user.id, body, deviceId);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: AuthedUser,
    @Param("id") id: string,
    @ZodBody(folderInputSchema) body: z.infer<typeof folderInputSchema>,
    @Headers("x-device-id") deviceId?: string,
  ): Promise<unknown> {
    return this.study.updateFolder(user.id, id, body, deviceId);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthedUser,
    @Param("id") id: string,
    @Headers("x-device-id") deviceId?: string,
  ): Promise<void> {
    await this.study.deleteFolder(user.id, id, deviceId);
  }
}

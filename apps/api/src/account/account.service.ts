import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import {
  bookmarks,
  devices,
  entitlements,
  folders,
  highlights,
  notes,
  planProgress,
  preferences,
  readingProgress,
  users,
} from "@holyword/db";
import { ApiError } from "../common/api-error";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class AccountService {
  constructor(private readonly database: DatabaseService) {}

  async export(userId: string): Promise<Record<string, unknown>> {
    const [user] = await this.database.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!user) throw ApiError.notFound("Account was not found");

    const [
      preferenceRows,
      bookmarkRows,
      highlightRows,
      noteRows,
      folderRows,
      planProgressRows,
      readingProgressRows,
      entitlementRows,
      deviceRows,
    ] = await Promise.all([
      this.database.db.select().from(preferences).where(eq(preferences.userId, userId)),
      this.database.db.select().from(bookmarks).where(eq(bookmarks.userId, userId)),
      this.database.db.select().from(highlights).where(eq(highlights.userId, userId)),
      this.database.db.select().from(notes).where(eq(notes.userId, userId)),
      this.database.db.select().from(folders).where(eq(folders.userId, userId)),
      this.database.db.select().from(planProgress).where(eq(planProgress.userId, userId)),
      this.database.db.select().from(readingProgress).where(eq(readingProgress.userId, userId)),
      this.database.db.select().from(entitlements).where(eq(entitlements.userId, userId)),
      this.database.db.select().from(devices).where(eq(devices.userId, userId)),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        locale: user.locale,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      preferences: preferenceRows,
      bookmarks: bookmarkRows,
      highlights: highlightRows,
      notes: noteRows,
      folders: folderRows,
      planProgress: planProgressRows,
      readingProgress: readingProgressRows,
      entitlements: entitlementRows,
      devices: deviceRows,
    };
  }

  /** Removes the account row; every user-owned table cascades from `users.id`. */
  async delete(userId: string): Promise<void> {
    await this.database.db.delete(users).where(eq(users.id, userId));
  }
}

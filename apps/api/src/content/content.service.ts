import { Inject, Injectable, Logger } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import {
  getBook,
  isVersionVisible,
  type LicenceStatus,
  type PackageManifest,
  type PackageVerse,
} from "@holyword/core";
import { contentVersions, type ContentVersionRow } from "@holyword/db";
import { ApiError } from "../common/api-error";
import { APP_CONFIG, type AppConfig } from "../config";
import { DatabaseService } from "../database/database.service";
import { OpenSearchClient } from "./open-search.client";
import { PackageIntegrityError, PackageStore, PackageUnavailableError } from "./package-store";

export type SearchEngine = "opensearch" | "local";

export interface VersionDto {
  readonly versionId: string;
  readonly versionCode: number;
  readonly name: string;
  readonly abbreviation: string;
  readonly language: string;
  readonly languageName: string;
  readonly direction: "ltr" | "rtl";
  readonly enabled: boolean;
  readonly licenceStatus: LicenceStatus;
  readonly verseCount: number;
  readonly downloadBytes?: number;
  readonly copyright: string;
  readonly attribution: string;
  readonly paraphrase: boolean;
}

export interface VerseDto {
  readonly id: string;
  readonly book: string;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
}

export interface ChapterDto {
  readonly versionId: string;
  readonly book: string;
  readonly bookName: string;
  readonly chapter: number;
  readonly verses: readonly VerseDto[];
  readonly copyright: string;
  readonly attribution: string;
}

export interface SearchHitDto {
  readonly verseId: string;
  readonly versionId: string;
  readonly book: string;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
}

export interface SearchResponseDto {
  readonly query: string;
  readonly scope: "version" | "all-versions" | "topic";
  readonly total: number;
  readonly results: readonly SearchHitDto[];
  readonly engine: SearchEngine;
}

function summaryOf(row: ContentVersionRow, enabled = row.enabled) {
  return {
    enabled,
    licenceStatus: row.licenceStatus,
    policy: row.policy,
  };
}

export function toVersionDto(row: ContentVersionRow, enabled = row.enabled): VersionDto {
  return {
    versionId: row.versionId,
    versionCode: row.versionCode,
    name: row.name,
    abbreviation: row.abbreviation,
    language: row.language,
    languageName: row.languageName,
    direction: row.direction === "rtl" ? "rtl" : "ltr",
    enabled,
    licenceStatus: row.licenceStatus,
    verseCount: row.verseCount,
    downloadBytes: row.packageBytes ?? 0,
    copyright: row.policy.copyright,
    attribution: row.policy.attribution,
    paraphrase: row.policy.licenceNote?.toLowerCase().includes("paraphrase") ?? false,
  };
}

function toVerseDto(verse: PackageVerse): VerseDto {
  return {
    id: verse.id,
    book: verse.book,
    chapter: verse.chapter,
    verse: verse.verse,
    text: verse.text,
  };
}

@Injectable()
export class ContentService {
  private readonly store: PackageStore;
  private readonly openSearch: OpenSearchClient | undefined;
  private readonly versionFlags: ReadonlySet<string> | undefined;
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private readonly database: DatabaseService,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.store = new PackageStore(config.contentPackageDir);
    this.openSearch = config.openSearch ? new OpenSearchClient(config.openSearch) : undefined;
    this.versionFlags = config.versionFlags;
  }

  /** Deployment-level per-version gate, separate from the audited catalog flag. */
  isFeatureEnabled(versionId: string): boolean {
    return !this.versionFlags || this.versionFlags.has(versionId);
  }

  /** A version is live only when both the catalog flag and deployment flag allow it. */
  isVersionEnabled(row: ContentVersionRow): boolean {
    return row.enabled && this.isFeatureEnabled(row.versionId);
  }

  toDto(row: ContentVersionRow): VersionDto {
    return toVersionDto(row, this.isVersionEnabled(row));
  }

  async listVersions(includeDisabled: boolean): Promise<VersionDto[]> {
    const rows = await this.database.db
      .select()
      .from(contentVersions)
      .orderBy(asc(contentVersions.versionCode));
    return rows
      .filter(
        (row) => includeDisabled || isVersionVisible(summaryOf(row, this.isVersionEnabled(row))),
      )
      .map((row) => this.toDto(row));
  }

  async listAllVersions(): Promise<VersionDto[]> {
    const rows = await this.database.db
      .select()
      .from(contentVersions)
      .orderBy(asc(contentVersions.versionCode));
    return rows.map((row) => this.toDto(row));
  }

  async getVisibleVersion(versionId: string): Promise<ContentVersionRow> {
    const [row] = await this.database.db
      .select()
      .from(contentVersions)
      .where(eq(contentVersions.versionId, versionId))
      .limit(1);
    if (!row || !isVersionVisible(summaryOf(row, this.isVersionEnabled(row)))) {
      throw ApiError.notFound(`Bible version "${versionId}" was not found`);
    }
    return row;
  }

  async getVersionRow(versionId: string): Promise<ContentVersionRow | undefined> {
    const [row] = await this.database.db
      .select()
      .from(contentVersions)
      .where(eq(contentVersions.versionId, versionId))
      .limit(1);
    return row;
  }

  async getChapter(versionId: string, book: string, chapter: number): Promise<ChapterDto> {
    const version = await this.getVisibleVersion(versionId);
    let verses: PackageVerse[];
    try {
      verses = await this.store.readChapter(versionId, book, chapter);
    } catch (error) {
      throw this.contentError(error, versionId);
    }
    if (verses.length === 0) {
      throw ApiError.notFound(`${book} ${chapter} was not found in ${version.name}`);
    }
    return {
      versionId,
      book,
      bookName: getBook(book)?.name ?? book,
      chapter,
      verses: verses.map(toVerseDto),
      copyright: version.policy.copyright,
      attribution: version.policy.attribution,
    };
  }

  async search(
    query: string,
    versionId: string | undefined,
    scope: "version" | "all-versions" | "topic",
    limit: number,
  ): Promise<SearchResponseDto> {
    const versions = versionId
      ? [await this.getVisibleVersion(versionId)]
      : (await this.database.db.select().from(contentVersions)).filter((row) =>
          isVersionVisible(summaryOf(row, this.isVersionEnabled(row))),
        );
    const versionIds = versions.map((version) => version.versionId);

    if (this.openSearch && versionIds.length > 0) {
      try {
        const documents = await this.openSearch.search(query, versionIds, limit);
        const results: SearchHitDto[] = documents.map((document) => ({
          verseId: document.verseId,
          versionId: document.versionId,
          book: document.book,
          chapter: document.chapter,
          verse: document.verse,
          text: document.text,
        }));
        return { query, scope, total: results.length, results, engine: "opensearch" };
      } catch (error) {
        // Search is a read path: keep the app usable if the managed index is
        // temporarily unavailable and fall back to the checksummed local mirror.
        this.logger.warn(
          `OpenSearch search failed; using local packages: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const results: SearchHitDto[] = [];
    for (const version of versions) {
      const remaining = limit - results.length;
      if (remaining <= 0) break;
      let hits: PackageVerse[];
      try {
        hits = await this.store.search(version.versionId, query, remaining);
      } catch (error) {
        if (error instanceof PackageUnavailableError) continue;
        throw this.contentError(error, version.versionId);
      }
      for (const hit of hits) {
        results.push({
          verseId: hit.id,
          versionId: version.versionId,
          book: hit.book,
          chapter: hit.chapter,
          verse: hit.verse,
          text: hit.text,
        });
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }

    return { query, scope, total: results.length, results, engine: "local" };
  }

  async manifestFor(versionId: string): Promise<{
    manifest: PackageManifest;
    checksum: string;
  }> {
    try {
      return await this.store.manifestFor(versionId);
    } catch (error) {
      throw this.contentError(error, versionId);
    }
  }

  async manifestFileFor(
    versionId: string,
    versionCode: number,
  ): Promise<{ bytes: Buffer; checksum: string }> {
    try {
      return await this.store.manifestFile(versionId, versionCode);
    } catch (error) {
      throw this.contentError(error, versionId);
    }
  }

  async archiveFor(versionId: string, versionCode: number): Promise<Buffer> {
    try {
      return await this.store.archiveFor(versionId, versionCode);
    } catch (error) {
      throw this.contentError(error, versionId);
    }
  }

  private contentError(error: unknown, versionId: string): Error {
    if (error instanceof PackageUnavailableError) {
      return ApiError.unavailable(
        "content-unavailable",
        `Content for "${versionId}" is not published yet`,
      );
    }
    if (error instanceof PackageIntegrityError) {
      return ApiError.unavailable(
        "content-integrity-failed",
        `Content for "${versionId}" failed integrity verification`,
      );
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}

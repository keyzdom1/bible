import type { Database } from "./client";
import { CATALOG, READING_PLAN_SEED } from "./catalog";
import { contentVersions, readingPlans } from "./schema";

/**
 * Seeds the version catalog and public reading plans.
 * Uses DO NOTHING for versions so an admin's enable/disable decisions are never
 * silently overwritten by a reseed.
 */
export async function seedCatalog(db: Database): Promise<void> {
  await db
    .insert(contentVersions)
    .values(
      CATALOG.map((entry) => ({
        versionId: entry.versionId,
        versionCode: entry.versionCode,
        name: entry.name,
        abbreviation: entry.abbreviation,
        language: entry.language,
        languageName: entry.languageName,
        direction: entry.direction,
        licenceStatus: entry.licenceStatus,
        enabled: entry.enabled,
        policy: entry.policy,
        verseCount: entry.verseCount,
        enabledAt: entry.enabled ? new Date() : null,
        enabledBy: entry.enabled ? "seed" : null,
      })),
    )
    .onConflictDoNothing({ target: contentVersions.versionId });

  await db
    .insert(readingPlans)
    .values({
      slug: READING_PLAN_SEED.slug,
      title: READING_PLAN_SEED.title,
      description: READING_PLAN_SEED.description,
      dayCount: READING_PLAN_SEED.dayCount,
      schedule: READING_PLAN_SEED.schedule,
      isPublished: true,
    })
    .onConflictDoUpdate({
      target: readingPlans.slug,
      set: {
        title: READING_PLAN_SEED.title,
        description: READING_PLAN_SEED.description,
        dayCount: READING_PLAN_SEED.dayCount,
        schedule: READING_PLAN_SEED.schedule,
        isPublished: true,
        updatedAt: new Date(),
      },
    });
}

import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { unzipSync } from "fflate";
import request from "supertest";
import {
  devices,
  entitlements,
  noteConflicts,
  seedCatalog,
  users,
  versionInstalls,
  type Database,
} from "@holyword/db";
import { AppModule } from "../src/app.module";
import { DatabaseService } from "../src/database/database.service";

const ADMIN_EMAIL = "admin@example.com";
const READER_EMAIL = "reader@example.com";
const OTHER_EMAIL = "other@example.com";
const SYNC_EMAIL = "sync@example.com";
const DELETE_EMAIL = "delete@example.com";

const migrationPath = resolve(__dirname, "../../../packages/db/drizzle/0000_initial.sql");
const fixturePath = resolve(__dirname, "../../../fixtures/synthetic");

let app: INestApplication;
let pglite: PGlite;
let db: ReturnType<typeof drizzle>;
let server: ReturnType<INestApplication["getHttpServer"]>;
let contentRoot: string;
let hlcCounter = 0;

const cookies = new Map<string, string>();

function hlc(): string {
  hlcCounter += 1;
  return `1792506623752:${String(hlcCounter).padStart(6, "0")}:test-node`;
}

const OLD_HLC = "1792506623000:000000:test-node";

async function login(email: string): Promise<string> {
  const cached = cookies.get(email);
  if (cached) return cached;
  const response = await request(server)
    .post("/v1/auth/session")
    .send({ idToken: `dev:${email}` })
    .expect(200);
  const setCookie = response.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error(`No session cookie returned for ${email}`);
  const cookie = raw.split(";")[0]!;
  cookies.set(email, cookie);
  return cookie;
}

function authed(method: "get" | "post" | "patch" | "put" | "delete", path: string, email: string) {
  return request(server)
    [method](path)
    .set("Cookie", cookies.get(email) ?? "");
}

function text(body: unknown): string {
  return JSON.stringify(body);
}

function validPolicy(status: "licensed" | "unlicensed" = "licensed") {
  return {
    status,
    offlineDownload: true,
    maxDevices: 1,
    maxVersesPerCopy: 5,
    maxVersesPerShare: 5,
    encryption: "none",
    regions: null,
    copyright: "Test licence copyright",
    attribution: "Test licence attribution",
    licenceNote: "Test policy",
  };
}

beforeAll(async () => {
  contentRoot = mkdtempSync(join(tmpdir(), "holyword-api-"));
  cpSync(fixturePath, join(contentRoot, "kjv"), { recursive: true });
  const manifestPath = join(contentRoot, "kjv", "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.versionId = "kjv";
  manifest.versionCode = 1;
  manifest.name = "King James Version";
  manifest.abbreviation = "KJV";
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  process.env.CONTENT_PACKAGE_DIR = contentRoot;

  pglite = new PGlite();
  await pglite.exec(readFileSync(migrationPath, "utf8"));
  db = drizzle(pglite);
  await seedCatalog(db as unknown as Database);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue({ db })
    .compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  server = app.getHttpServer();
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pglite?.close();
  if (contentRoot) rmSync(contentRoot, { recursive: true, force: true });
});

describe("health", () => {
  it("serves a public health probe", async () => {
    const response = await request(server).get("/health").expect(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});

describe("authentication", () => {
  it("rejects anonymous session reads", async () => {
    const response = await request(server).get("/v1/auth/session").expect(401);
    expect(response.body.code).toBe("unauthorized");
  });

  it("rejects an invalid identity token", async () => {
    const response = await request(server)
      .post("/v1/auth/session")
      .send({ idToken: "dev:not-an-email" })
      .expect(401);
    expect(response.body.code).toBe("unauthorized");
  });

  it("exchanges a token for an httpOnly cookie session", async () => {
    const response = await request(server)
      .post("/v1/auth/session")
      .send({ idToken: `dev:${READER_EMAIL}` })
      .expect(200);
    expect(response.body.email).toBe(READER_EMAIL);
    expect(response.body.userId).toMatch(/^[0-9a-f-]{36}$/);
    const raw = response.headers["set-cookie"];
    const cookie = Array.isArray(raw) ? raw[0] : raw;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    cookies.set(READER_EMAIL, cookie!.split(";")[0]!);

    const session = await request(server)
      .get("/v1/auth/session")
      .set("Cookie", cookies.get(READER_EMAIL)!)
      .expect(200);
    expect(session.body.email).toBe(READER_EMAIL);
  });

  it("supports bearer authentication for mobile clients", async () => {
    const response = await request(server)
      .get("/v1/auth/session")
      .set("Authorization", `Bearer dev:${OTHER_EMAIL}`);
    expect(response.status).toBe(401);

    await request(server)
      .post("/v1/auth/session")
      .send({ idToken: `dev:${OTHER_EMAIL}` })
      .expect(200);
    const bearer = await request(server)
      .get("/v1/auth/session")
      .set("Authorization", `Bearer dev:${OTHER_EMAIL}`)
      .expect(200);
    expect(bearer.body.email).toBe(OTHER_EMAIL);
  });

  it("clears the session cookie on sign out", async () => {
    const response = await request(server).delete("/v1/auth/session").expect(204);
    const raw = response.headers["set-cookie"];
    const cookie = Array.isArray(raw) ? raw[0] : raw;
    expect(cookie).toMatch(/holyword_session=;/);
  });
});

describe("version catalog and reading", () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await login(READER_EMAIL);
  });

  it("lists only visible versions by default", async () => {
    const response = await request(server).get("/v1/versions").set("Cookie", cookie).expect(200);
    const ids = response.body.versions.map((version: { versionId: string }) => version.versionId);
    expect(ids).toContain("kjv");
    expect(ids).not.toContain("niv");
    const kjv = response.body.versions.find(
      (version: { versionId: string }) => version.versionId === "kjv",
    );
    expect(kjv).toMatchObject({
      enabled: true,
      licenceStatus: "public-domain",
      abbreviation: "KJV",
      direction: "ltr",
    });
    expect(kjv.copyright).toMatch(/public domain/i);
  });

  it("returns disabled metadata when requested", async () => {
    const response = await request(server)
      .get("/v1/versions?includeDisabled=true")
      .set("Cookie", cookie)
      .expect(200);
    const niv = response.body.versions.find(
      (version: { versionId: string }) => version.versionId === "niv",
    );
    expect(niv).toMatchObject({ enabled: false, licenceStatus: "unlicensed" });
  });

  it("serves version details and rejects unknown versions", async () => {
    const response = await request(server)
      .get("/v1/versions/kjv")
      .set("Cookie", cookie)
      .expect(200);
    expect(response.body.name).toBe("King James Version");
    const missing = await request(server)
      .get("/v1/versions/nope")
      .set("Cookie", cookie)
      .expect(404);
    expect(missing.body.code).toBe("not-found");
  });

  it("reads a chapter from the published package", async () => {
    const response = await request(server)
      .get("/v1/versions/kjv/books/GEN/chapters/1")
      .set("Cookie", cookie)
      .expect(200);
    expect(response.body).toMatchObject({
      versionId: "kjv",
      book: "GEN",
      bookName: "Genesis",
      chapter: 1,
    });
    expect(response.body.verses).toHaveLength(3);
    expect(response.body.verses[0]).toMatchObject({ id: "GEN.1.1", verse: 1 });
    expect(response.body.attribution).toBeTruthy();
  });

  it("rejects malformed and missing chapters", async () => {
    const badBook = await request(server)
      .get("/v1/versions/kjv/books/ZZZ/chapters/1")
      .set("Cookie", cookie)
      .expect(400);
    expect(badBook.body.code).toBe("invalid-book");
    await request(server)
      .get("/v1/versions/kjv/books/GEN/chapters/99")
      .set("Cookie", cookie)
      .expect(404);
  });

  it("serves a disabled version as not found", async () => {
    await request(server)
      .get("/v1/versions/niv/books/GEN/chapters/1")
      .set("Cookie", cookie)
      .expect(404);
  });

  it("searches package text", async () => {
    const response = await request(server)
      .get("/v1/search")
      .set("Cookie", cookie)
      .query({ q: "beginning", versionId: "kjv" })
      .expect(200);
    expect(response.body.total).toBeGreaterThan(0);
    expect(response.body.engine).toBe("local");
    expect(response.body.results[0]).toMatchObject({
      verseId: "GEN.1.1",
      versionId: "kjv",
      book: "GEN",
      chapter: 1,
    });
  });

  it("issues a signed download ticket for a public-domain version", async () => {
    const cookie = await login(READER_EMAIL);
    const response = await request(server)
      .post("/v1/versions/kjv/download-ticket")
      .set("Cookie", cookie)
      .send({ deviceId: "11111111-1111-4111-8111-111111111111", platform: "web" })
      .expect(200);
    expect(response.body.packageVersion).toBe(1);
    expect(response.body.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(response.body.url).toContain(
      "https://content.test/v1/content/packages/kjv/1/package.zip",
    );
    expect(response.body.manifestUrl).toContain("manifest.json?ticket=");
    expect(new Date(response.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("serves a checksummed package and manifest only with a valid ticket", async () => {
    const cookie = await login(READER_EMAIL);
    const ticketResponse = await request(server)
      .post("/v1/versions/kjv/download-ticket")
      .set("Cookie", cookie)
      .send({ deviceId: "11111111-1111-4111-8111-111111111111", platform: "web" })
      .expect(200);
    const packageUrl = new URL(ticketResponse.body.url as string);
    const manifestUrl = new URL(ticketResponse.body.manifestUrl as string);

    const manifestResponse = await request(server)
      .get(`${manifestUrl.pathname}${manifestUrl.search}`)
      .expect(200);
    expect(manifestResponse.headers["x-checksum-sha256"]).toBe(ticketResponse.body.checksum);
    const manifest = JSON.parse(manifestResponse.text) as {
      versionId: string;
      versionCode: number;
      books: Array<{ code: string; file: string }>;
    };
    expect(manifest).toMatchObject({ versionId: "kjv", versionCode: 1 });

    const archiveResponse = await request(server)
      .get(`${packageUrl.pathname}${packageUrl.search}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
        response.on("error", (error: Error) => callback(error, Buffer.alloc(0)));
      })
      .expect(200);
    expect(archiveResponse.headers["content-type"]).toContain("application/zip");
    expect(archiveResponse.headers["accept-ranges"]).toBe("bytes");
    const archiveBytes = archiveResponse.body as Buffer;
    const files = unzipSync(new Uint8Array(archiveBytes));
    const zippedManifest = files["manifest.json"];
    expect(zippedManifest).toBeDefined();
    expect(new TextDecoder().decode(zippedManifest)).toContain('"versionId": "kjv"');
    expect(files["books/GEN.ndjson"]).toBeDefined();

    const ranged = await request(server)
      .get(`${packageUrl.pathname}${packageUrl.search}`)
      .set("Range", "bytes=8-23")
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
        response.on("error", (error: Error) => callback(error, Buffer.alloc(0)));
      })
      .expect(206);
    expect(ranged.headers["content-range"]).toBe(`bytes 8-23/${archiveBytes.byteLength}`);
    expect(ranged.headers["content-length"]).toBe("16");
    expect(Buffer.compare(ranged.body as Buffer, archiveBytes.subarray(8, 24))).toBe(0);

    await request(server)
      .get(`${packageUrl.pathname}${packageUrl.search}`)
      .set("Range", `bytes=${archiveBytes.byteLength}-`)
      .expect(416)
      .expect("Content-Range", `bytes */${archiveBytes.byteLength}`);

    await request(server).get(packageUrl.pathname).expect(403);
    await request(server)
      .get(`${packageUrl.pathname}${packageUrl.search}`.replace("/1/package.zip", "/2/package.zip"))
      .expect(403);
  });

  it("denies download tickets for disabled or unauthenticated requests", async () => {
    await request(server)
      .post("/v1/versions/kjv/download-ticket")
      .send({ deviceId: randomUUID() })
      .expect(401);

    const cookie = await login(READER_EMAIL);
    const response = await request(server)
      .post("/v1/versions/niv/download-ticket")
      .set("Cookie", cookie)
      .send({ deviceId: randomUUID() })
      .expect(403);
    expect(response.body.code).toBe("version-disabled");
  });
});

describe("bookmarks and highlights", () => {
  const bookmarkId = randomUUID();

  it("creates, lists, updates and tombstones a bookmark", async () => {
    const cookie = await login(READER_EMAIL);
    const created = await request(server)
      .post("/v1/bookmarks")
      .set("Cookie", cookie)
      .send({
        id: bookmarkId,
        verseId: "GEN.1.1",
        versionId: "kjv",
        label: "Creation",
        hlc: hlc(),
      })
      .expect(201);
    expect(created.body).toMatchObject({
      id: bookmarkId,
      label: "Creation",
      serverVersion: 1,
    });

    const list = await request(server).get("/v1/bookmarks").set("Cookie", cookie).expect(200);
    expect(list.body.items).toHaveLength(1);

    const updated = await request(server)
      .patch(`/v1/bookmarks/${bookmarkId}`)
      .set("Cookie", cookie)
      .send({
        id: bookmarkId,
        verseId: "GEN.1.1",
        versionId: "kjv",
        label: "Creation account",
        hlc: hlc(),
      })
      .expect(200);
    expect(updated.body).toMatchObject({ label: "Creation account", serverVersion: 2 });

    const stale = await request(server)
      .patch(`/v1/bookmarks/${bookmarkId}`)
      .set("Cookie", cookie)
      .send({
        id: bookmarkId,
        verseId: "GEN.1.1",
        versionId: "kjv",
        label: "Stale edit",
        hlc: OLD_HLC,
      })
      .expect(200);
    expect(stale.body.label).toBe("Creation account");

    await request(server).delete(`/v1/bookmarks/${bookmarkId}`).set("Cookie", cookie).expect(204);
    const after = await request(server).get("/v1/bookmarks").set("Cookie", cookie).expect(200);
    expect(after.body.items).toHaveLength(0);
  });

  it("isolates study data per user", async () => {
    const other = await login(OTHER_EMAIL);
    const list = await request(server).get("/v1/bookmarks").set("Cookie", other).expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it("validates bookmark input", async () => {
    const cookie = await login(READER_EMAIL);
    const response = await request(server)
      .post("/v1/bookmarks")
      .set("Cookie", cookie)
      .send({ id: "not-a-uuid", verseId: "GEN.1.1", versionId: "kjv", hlc: "bad" })
      .expect(400);
    expect(response.body.code).toBe("validation-failed");
  });

  it("creates and deletes a highlight", async () => {
    const cookie = await login(READER_EMAIL);
    const id = randomUUID();
    const created = await request(server)
      .post("/v1/highlights")
      .set("Cookie", cookie)
      .send({
        id,
        verseId: "GEN.1.2",
        versionId: "kjv",
        color: "gold",
        startOffset: 0,
        endOffset: 12,
        hlc: hlc(),
      })
      .expect(201);
    expect(created.body.color).toBe("gold");
    const list = await request(server).get("/v1/highlights").set("Cookie", cookie).expect(200);
    expect(list.body.items.some((item: { id: string }) => item.id === id)).toBe(true);
    await request(server).delete(`/v1/highlights/${id}`).set("Cookie", cookie).expect(204);
  });

  it("rejects invalid highlight offsets", async () => {
    const cookie = await login(READER_EMAIL);
    const response = await request(server)
      .post("/v1/highlights")
      .set("Cookie", cookie)
      .send({
        id: randomUUID(),
        verseId: "GEN.1.1",
        versionId: "kjv",
        color: "gold",
        startOffset: 10,
        endOffset: 2,
        hlc: hlc(),
      })
      .expect(400);
    expect(response.body.code).toBe("validation-failed");
  });
});

describe("folders and notes", () => {
  const folderId = randomUUID();
  const noteId = randomUUID();

  it("creates folders and a note inside one", async () => {
    const cookie = await login(READER_EMAIL);
    await request(server)
      .post("/v1/folders")
      .set("Cookie", cookie)
      .send({ id: folderId, name: "Sermons", hlc: hlc() })
      .expect(201);
    await request(server)
      .post("/v1/folders")
      .set("Cookie", cookie)
      .send({ id: randomUUID(), name: "Orphan", parentId: folderId, hlc: hlc() })
      .expect(201);

    const note = await request(server)
      .post("/v1/notes")
      .set("Cookie", cookie)
      .send({
        id: noteId,
        verseId: "GEN.1.1",
        reference: "Genesis 1:1",
        title: "Beginnings",
        body: "first version",
        folderId,
        hlc: hlc(),
      })
      .expect(201);
    expect(note.body).toMatchObject({ folderId, body: "first version", serverVersion: 1 });
  });

  it("rejects notes pointing at unknown folders", async () => {
    const cookie = await login(READER_EMAIL);
    const response = await request(server)
      .post("/v1/notes")
      .set("Cookie", cookie)
      .send({
        id: randomUUID(),
        body: "orphan",
        folderId: randomUUID(),
        hlc: hlc(),
      })
      .expect(400);
    expect(response.body.code).toBe("invalid-folder");
  });

  it("preserves both sides of a concurrent note edit", async () => {
    const cookie = await login(READER_EMAIL);
    const response = await request(server)
      .patch(`/v1/notes/${noteId}`)
      .set("Cookie", cookie)
      .send({
        id: noteId,
        verseId: "GEN.1.1",
        reference: "Genesis 1:1",
        title: "Beginnings",
        body: "second version",
        folderId,
        hlc: hlc(),
        baseVersion: 0,
      })
      .expect(409);
    expect(response.body.code).toBe("note-conflict");
    expect(response.body.conflictId).toMatch(/^[0-9a-f-]{36}$/);

    const list = await request(server).get("/v1/notes").set("Cookie", cookie).expect(200);
    const note = list.body.items.find((item: { id: string }) => item.id === noteId);
    expect(note.body).toBe("second version");
    expect(note.serverVersion).toBe(2);

    const [conflict] = await db
      .select()
      .from(noteConflicts)
      .where(eq(noteConflicts.noteId, noteId));
    expect(conflict?.localPayload).toMatchObject({ body: "second version" });
    expect(conflict?.remotePayload).toMatchObject({ body: "first version" });
  });

  it("accepts a follow-up edit based on the current version", async () => {
    const cookie = await login(READER_EMAIL);
    const response = await request(server)
      .patch(`/v1/notes/${noteId}`)
      .set("Cookie", cookie)
      .send({
        id: noteId,
        verseId: "GEN.1.1",
        reference: "Genesis 1:1",
        title: "Beginnings",
        body: "resolved version",
        folderId,
        hlc: hlc(),
        baseVersion: 2,
      })
      .expect(200);
    expect(response.body.body).toBe("resolved version");
    expect(response.body.serverVersion).toBe(3);
  });

  it("rejects folder cycles and deletes entities", async () => {
    const cookie = await login(READER_EMAIL);
    const response = await request(server)
      .patch(`/v1/folders/${folderId}`)
      .set("Cookie", cookie)
      .send({ id: folderId, name: "Sermons", parentId: folderId, hlc: hlc() })
      .expect(400);
    expect(response.body.code).toBe("invalid-folder");

    await request(server).delete(`/v1/notes/${noteId}`).set("Cookie", cookie).expect(204);
    await request(server).delete(`/v1/folders/${folderId}`).set("Cookie", cookie).expect(204);
  });
});

describe("plans, progress and preferences", () => {
  let planId: string;
  const progressId = randomUUID();

  it("lists the published reading plan", async () => {
    const cookie = await login(READER_EMAIL);
    const response = await request(server).get("/v1/plans").set("Cookie", cookie).expect(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].slug).toBe("john-in-21-days");
    expect(response.body.items[0].schedule).toHaveLength(21);
    planId = response.body.items[0].id;
    await request(server).get(`/v1/plans/${planId}`).set("Cookie", cookie).expect(200);
    await request(server).get(`/v1/plans/${randomUUID()}`).set("Cookie", cookie).expect(404);
  });

  it("stores and updates plan progress", async () => {
    const cookie = await login(READER_EMAIL);
    const created = await request(server)
      .put(`/v1/plans/${planId}/progress`)
      .set("Cookie", cookie)
      .send({
        id: progressId,
        dayNumber: 1,
        completedAt: new Date().toISOString(),
        hlc: hlc(),
      })
      .expect(200);
    expect(created.body).toMatchObject({ planId, dayNumber: 1, serverVersion: 1 });

    const updated = await request(server)
      .put(`/v1/plans/${planId}/progress`)
      .set("Cookie", cookie)
      .send({ id: progressId, dayNumber: 2, completedAt: null, hlc: hlc() })
      .expect(200);
    expect(updated.body).toMatchObject({ dayNumber: 2, completedAt: null, serverVersion: 2 });

    const list = await request(server)
      .get(`/v1/plans/${planId}/progress`)
      .set("Cookie", cookie)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
  });

  it("tracks reading position per version", async () => {
    const cookie = await login(READER_EMAIL);
    const created = await request(server)
      .put("/v1/reading-progress")
      .set("Cookie", cookie)
      .send({ versionId: "kjv", book: "GEN", chapter: 1, verse: 2, hlc: hlc() })
      .expect(200);
    expect(created.body).toMatchObject({ versionId: "kjv", chapter: 1, serverVersion: 1 });

    const updated = await request(server)
      .put("/v1/reading-progress")
      .set("Cookie", cookie)
      .send({ versionId: "kjv", book: "GEN", chapter: 2, hlc: hlc() })
      .expect(200);
    expect(updated.body).toMatchObject({ chapter: 2, serverVersion: 2, verse: null });

    const list = await request(server)
      .get("/v1/reading-progress")
      .set("Cookie", cookie)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
  });

  it("returns defaults then stores preferences", async () => {
    const cookie = await login(READER_EMAIL);
    const defaults = await request(server).get("/v1/preferences").set("Cookie", cookie).expect(200);
    expect(defaults.body).toMatchObject({ theme: "system", fontScale: 100, serverVersion: 0 });

    const updated = await request(server)
      .put("/v1/preferences")
      .set("Cookie", cookie)
      .send({ theme: "dark", readingTheme: "sepia", fontScale: 120, hlc: hlc() })
      .expect(200);
    expect(updated.body).toMatchObject({
      theme: "dark",
      readingTheme: "sepia",
      fontScale: 120,
      serverVersion: 1,
    });
    const fetched = await request(server).get("/v1/preferences").set("Cookie", cookie).expect(200);
    expect(fetched.body.theme).toBe("dark");
  });
});

describe("sync", () => {
  const deviceId = "22222222-2222-4222-8222-222222222222";
  const bookmarkId = randomUUID();
  const pushOp = randomUUID();
  let firstSeq: number;

  it("applies a pushed change and returns a cursor", async () => {
    await login(SYNC_EMAIL);
    const response = await authed("post", "/v1/sync/push", SYNC_EMAIL)
      .send({
        deviceId,
        ops: [
          {
            opId: pushOp,
            entity: "bookmark",
            entityId: bookmarkId,
            op: "upsert",
            payload: { verseId: "GEN.1.2", versionId: "kjv", label: "Synced" },
            hlc: hlc(),
          },
        ],
      })
      .expect(200);
    expect(response.body.results[0]).toMatchObject({ opId: pushOp, status: "applied" });
    firstSeq = response.body.results[0].serverSeq;
    expect(typeof firstSeq).toBe("number");
    expect(response.body.cursor).toBe(String(firstSeq));
  });

  it("de-duplicates replayed operations", async () => {
    const response = await authed("post", "/v1/sync/push", SYNC_EMAIL)
      .send({
        deviceId,
        ops: [
          {
            opId: pushOp,
            entity: "bookmark",
            entityId: bookmarkId,
            op: "upsert",
            payload: { verseId: "GEN.1.2", versionId: "kjv", label: "Synced" },
            hlc: hlc(),
          },
        ],
      })
      .expect(200);
    expect(response.body.results[0]).toMatchObject({
      status: "duplicate",
      serverSeq: firstSeq,
    });
  });

  it("pulls changes after a cursor", async () => {
    const response = await authed("get", "/v1/sync/pull?cursor=0&limit=200", SYNC_EMAIL).expect(
      200,
    );
    expect(response.body.changes).toHaveLength(1);
    expect(response.body.changes[0]).toMatchObject({
      entity: "bookmark",
      entityId: bookmarkId,
      op: "upsert",
      tombstone: false,
    });
    expect(response.body.cursor).toBe(String(firstSeq));

    const empty = await authed(
      "get",
      `/v1/sync/pull?cursor=${response.body.cursor}`,
      SYNC_EMAIL,
    ).expect(200);
    expect(empty.body.changes).toHaveLength(0);
    expect(empty.body.hasMore).toBe(false);
  });

  it("applies last-write-wins and records tombstones", async () => {
    await authed("post", "/v1/sync/push", SYNC_EMAIL)
      .send({
        deviceId,
        ops: [
          {
            opId: randomUUID(),
            entity: "bookmark",
            entityId: bookmarkId,
            op: "upsert",
            payload: { verseId: "GEN.1.2", versionId: "kjv", label: "Older edit" },
            hlc: OLD_HLC,
          },
        ],
      })
      .expect(200);
    const list = await authed("get", "/v1/bookmarks", SYNC_EMAIL).expect(200);
    expect(list.body.items[0].label).toBe("Synced");

    const deleted = await authed("post", "/v1/sync/push", SYNC_EMAIL)
      .send({
        deviceId,
        ops: [
          {
            opId: randomUUID(),
            entity: "bookmark",
            entityId: bookmarkId,
            op: "delete",
            hlc: hlc(),
          },
        ],
      })
      .expect(200);
    expect(deleted.body.results[0].status).toBe("applied");
    expect(deleted.body.results[0].serverVersion).toBe(2);

    const pull = await authed("get", "/v1/sync/pull?cursor=0", SYNC_EMAIL).expect(200);
    const tombstone = pull.body.changes.find(
      (change: { op: string; entityId: string }) =>
        change.op === "delete" && change.entityId === bookmarkId,
    );
    expect(tombstone).toMatchObject({ tombstone: true, payload: null });
  });

  it("rejects malformed payloads without aborting the batch", async () => {
    const response = await authed("post", "/v1/sync/push", SYNC_EMAIL)
      .send({
        deviceId,
        ops: [
          {
            opId: randomUUID(),
            entity: "bookmark",
            entityId: randomUUID(),
            op: "upsert",
            payload: { verseId: "GEN.1.2" },
            hlc: hlc(),
          },
        ],
      })
      .expect(200);
    expect(response.body.results[0]).toMatchObject({
      status: "rejected",
      reason: "invalid-payload",
    });
  });

  it("flags sync note conflicts and preserves both versions", async () => {
    const cookie = await login(READER_EMAIL);
    const noteId = randomUUID();
    await request(server)
      .post("/v1/notes")
      .set("Cookie", cookie)
      .send({ id: noteId, body: "baseline", hlc: hlc() })
      .expect(201);

    const response = await authed("post", "/v1/sync/push", READER_EMAIL)
      .send({
        deviceId,
        ops: [
          {
            opId: randomUUID(),
            entity: "note",
            entityId: noteId,
            op: "upsert",
            payload: {
              body: "sync edit",
              verseId: null,
              reference: null,
              title: null,
              folderId: null,
            },
            hlc: hlc(),
            baseVersion: 0,
          },
        ],
      })
      .expect(200);
    expect(response.body.results[0].status).toBe("conflict");
    expect(response.body.results[0].conflictId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("requires authentication", async () => {
    await request(server).get("/v1/sync/pull").expect(401);
  });
});

describe("account", () => {
  it("exports all user data", async () => {
    const cookie = await login(READER_EMAIL);
    const response = await request(server)
      .get("/v1/account/export")
      .set("Cookie", cookie)
      .expect(200);
    expect(text(response.body)).toContain(READER_EMAIL);
    expect(response.body).toHaveProperty("bookmarks");
    expect(response.body).toHaveProperty("notes");
  });

  it("deletes the account and rejects its session", async () => {
    const cookie = await login(DELETE_EMAIL);
    await request(server).delete("/v1/account").set("Cookie", cookie).expect(202);
    await request(server).get("/v1/auth/session").set("Cookie", cookie).expect(401);
  });
});

describe("admin", () => {
  const licensedPolicy = validPolicy("licensed");

  it("rejects non-administrators", async () => {
    const cookie = await login(READER_EMAIL);
    const response = await request(server)
      .post("/v1/admin/versions/niv/enable")
      .set("Cookie", cookie)
      .send({ versionCode: 3, policy: licensedPolicy })
      .expect(403);
    expect(response.body.code).toBe("forbidden");
  });

  it("refuses to enable an unlicensed version", async () => {
    const cookie = await login(ADMIN_EMAIL);
    const response = await request(server)
      .post("/v1/admin/versions/niv/enable")
      .set("Cookie", cookie)
      .send({ versionCode: 3, policy: validPolicy("unlicensed") })
      .expect(400);
    expect(response.body.code).toBe("unlicensed-version");
  });

  it("enables a licensed version and audits the change", async () => {
    const cookie = await login(ADMIN_EMAIL);
    const response = await request(server)
      .post("/v1/admin/versions/niv/enable")
      .set("Cookie", cookie)
      .send({ versionCode: 3, policy: licensedPolicy })
      .expect(200);
    expect(response.body).toMatchObject({ enabled: true, licenceStatus: "licensed" });

    const catalog = await request(server).get("/v1/versions").set("Cookie", cookie).expect(200);
    expect(
      catalog.body.versions.some(
        (version: { versionId: string; enabled: boolean }) =>
          version.versionId === "niv" && version.enabled,
      ),
    ).toBe(true);

    const audit = await request(server)
      .get("/v1/admin/audit-log?limit=10")
      .set("Cookie", cookie)
      .expect(200);
    expect(
      audit.body.items.some(
        (entry: { action: string; targetId: string }) =>
          entry.action === "version.enabled" && entry.targetId === "niv",
      ),
    ).toBe(true);
  });

  it("enforces entitlements and device limits for licensed versions", async () => {
    const cookie = await login(READER_EMAIL);
    const [reader] = await db.select().from(users).where(eq(users.email, READER_EMAIL));
    expect(reader).toBeDefined();

    const denied = await request(server)
      .post("/v1/versions/niv/download-ticket")
      .set("Cookie", cookie)
      .send({ deviceId: randomUUID() })
      .expect(403);
    expect(denied.body.code).toBe("entitlement-required");

    await db.insert(entitlements).values({
      userId: reader!.id,
      versionId: "niv",
      kind: "offline",
      source: "test",
    });

    const allowedButUnpublished = await request(server)
      .post("/v1/versions/niv/download-ticket")
      .set("Cookie", cookie)
      .send({ deviceId: randomUUID() })
      .expect(503);
    expect(allowedButUnpublished.body.code).toBe("content-unavailable");

    const otherDevice = "33333333-3333-4333-8333-333333333333";
    await db.insert(devices).values({
      id: otherDevice,
      userId: reader!.id,
      platform: "web",
    });
    await db.insert(versionInstalls).values({
      userId: reader!.id,
      deviceId: otherDevice,
      versionId: "niv",
    });
    const limited = await request(server)
      .post("/v1/versions/niv/download-ticket")
      .set("Cookie", cookie)
      .send({ deviceId: randomUUID() })
      .expect(403);
    expect(limited.body.code).toBe("device-limit");
  });

  it("blocks downloads from restricted regions", async () => {
    const admin = await login(ADMIN_EMAIL);
    await request(server)
      .post("/v1/admin/versions/niv/enable")
      .set("Cookie", admin)
      .send({ versionCode: 3, policy: { ...licensedPolicy, regions: ["US"] } })
      .expect(200);

    const cookie = await login(READER_EMAIL);
    const response = await request(server)
      .post("/v1/versions/niv/download-ticket")
      .set("Cookie", cookie)
      .set("cloudfront-viewer-country", "GB")
      .send({ deviceId: randomUUID() })
      .expect(403);
    expect(response.body.code).toBe("region-blocked");
  });

  it("disables a version and records it in the audit log", async () => {
    const cookie = await login(ADMIN_EMAIL);
    const response = await request(server)
      .post("/v1/admin/versions/niv/disable")
      .set("Cookie", cookie)
      .expect(200);
    expect(response.body).toMatchObject({ enabled: false });

    const catalog = await request(server).get("/v1/versions").set("Cookie", cookie).expect(200);
    expect(
      catalog.body.versions.some((version: { versionId: string }) => version.versionId === "niv"),
    ).toBe(false);
    const audit = await request(server)
      .get("/v1/admin/audit-log")
      .set("Cookie", cookie)
      .expect(200);
    expect(
      audit.body.items.some((entry: { action: string }) => entry.action === "version.disabled"),
    ).toBe(true);
  });

  it("protects the audit log", async () => {
    const cookie = await login(READER_EMAIL);
    await request(server).get("/v1/admin/audit-log").set("Cookie", cookie).expect(403);
  });

  it("rejects enabling an unknown version", async () => {
    const cookie = await login(ADMIN_EMAIL);
    await request(server)
      .post("/v1/admin/versions/unknown/enable")
      .set("Cookie", cookie)
      .send({ versionCode: 99, policy: licensedPolicy })
      .expect(404);
  });
});

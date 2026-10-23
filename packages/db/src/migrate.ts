import "./env";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");

async function main(): Promise<void> {
  const { db, client } = createDb();
  try {
    console.log(`Applying migrations from ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    console.log("Migrations applied.");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

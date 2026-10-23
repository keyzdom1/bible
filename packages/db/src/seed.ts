import "./env";
import { createDb } from "./client";
import { seedCatalog } from "./seed-data";

async function main(): Promise<void> {
  const { db, client } = createDb();
  try {
    await seedCatalog(db);
    console.log("Catalog seeded.");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

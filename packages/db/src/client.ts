import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Driver-agnostic Drizzle database. Production uses postgres-js/TCP;
 * tests use PGlite (WASM PostgreSQL), and both satisfy this interface.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface DbHandle {
  readonly db: PostgresJsDatabase<typeof schema>;
  readonly client: postgres.Sql;
}

export function createDb(databaseUrl = process.env.DATABASE_URL): DbHandle {
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and start PostgreSQL (see README).",
    );
  }
  const client = postgres(databaseUrl, { max: 10, onnotice: () => undefined });
  return { db: drizzle(client, { schema }), client };
}

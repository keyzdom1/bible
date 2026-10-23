import { DatabaseSync } from "node:sqlite";
import type { SqliteDriver, SqliteValue } from "../src/sqlite";

/** Test-only adapter around Node's built-in SQLite (which includes FTS5). */
export class NodeSqliteDriver implements SqliteDriver {
  private readonly database: DatabaseSync;

  constructor(path = ":memory:") {
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec("PRAGMA foreign_keys = ON");
  }

  async exec(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async all<T>(sql: string, params: readonly SqliteValue[] = []): Promise<T[]> {
    return this.database.prepare(sql).all(...params) as T[];
  }

  async get<T>(sql: string, params: readonly SqliteValue[] = []): Promise<T | undefined> {
    return this.database.prepare(sql).get(...params) as T | undefined;
  }

  async run(sql: string, params: readonly SqliteValue[] = []): Promise<void> {
    this.database.prepare(sql).run(...params);
  }

  async transaction<T>(task: () => Promise<T>): Promise<T> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = await task();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

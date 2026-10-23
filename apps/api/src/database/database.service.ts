import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createDb, type Database } from "@holyword/db";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly handle = createDb();

  get db(): Database {
    return this.handle.db;
  }

  async onModuleDestroy(): Promise<void> {
    await this.handle.client.end({ timeout: 5 });
  }
}

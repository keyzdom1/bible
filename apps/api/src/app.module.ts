import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AccountModule } from "./account/account.module";
import { AdminModule } from "./admin/admin.module";
import { AppController } from "./app.controller";
import { AuthGuard } from "./auth/auth.guard";
import { AuthModule } from "./auth/auth.module";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { ConfigModule } from "./config.module";
import { ContentModule } from "./content/content.module";
import { DatabaseModule } from "./database/database.module";
import { SearchModule } from "./search/search.module";
import { StudyModule } from "./study/study.module";
import { SyncModule } from "./sync/sync.module";
import { VersionsModule } from "./versions/versions.module";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    AuthModule,
    ContentModule,
    VersionsModule,
    SearchModule,
    StudyModule,
    SyncModule,
    AccountModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}

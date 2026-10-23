import { Module } from "@nestjs/common";
import { DownloadTicketService } from "./download-ticket.service";
import { VersionsController } from "./versions.controller";

@Module({
  controllers: [VersionsController],
  providers: [DownloadTicketService],
})
export class VersionsModule {}

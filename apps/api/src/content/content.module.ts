import { Global, Module } from "@nestjs/common";
import { ContentDeliveryController } from "./content-delivery.controller";
import { ContentService } from "./content.service";
import { PackageDeliveryService } from "./delivery.service";

@Global()
@Module({
  controllers: [ContentDeliveryController],
  providers: [ContentService, PackageDeliveryService],
  exports: [ContentService, PackageDeliveryService],
})
export class ContentModule {}

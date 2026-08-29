import { Module } from "@nestjs/common";

import { S3Service } from "./s3.service.js";
import { SyncController } from "./sync.controller.js";
import { SyncService } from "./sync.service.js";

@Module({
	controllers: [SyncController],
	providers: [SyncService, S3Service],
})
export class SyncModule {}

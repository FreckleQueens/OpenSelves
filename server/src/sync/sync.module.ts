import { Module } from "@nestjs/common";

import { AttachmentController } from "./attachment.controller.js";
import { S3Service } from "./s3.service.js";
import { SyncController } from "./sync.controller.js";
import { SyncService } from "./sync.service.js";

@Module({
	controllers: [AttachmentController, SyncController],
	providers: [SyncService, S3Service],
})
export class SyncModule {}

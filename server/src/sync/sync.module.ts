import { Module } from "@nestjs/common";
import { APP_PIPE } from "@nestjs/core";

import { AppCommand } from "../AppCommand.js";
import { AttachmentController } from "./attachment.controller.js";
import { MIGRATE_TO_WILLOW_COMMAND } from "./commands/migrate-to-willow.command.js";
import { PushDtoTransformPipe } from "./data/push.dto.js";
import { S3Service, S3_COMMAND } from "./s3.service.js";
import { SyncController } from "./sync.controller.js";
import { SyncService } from "./sync.service.js";

@Module({
	controllers: [AttachmentController, SyncController],
	providers: [
		SyncService,
		S3Service,
		{
			provide: APP_PIPE,
			useClass: PushDtoTransformPipe,
		},
		{
			provide: AppCommand,
			useValue: [MIGRATE_TO_WILLOW_COMMAND, S3_COMMAND],
		},
	],
})
export class SyncModule {}

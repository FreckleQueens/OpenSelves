import * as fs from "node:fs";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_PIPE } from "@nestjs/core";
import { MulterModule } from "@nestjs/platform-express";
import { type StorageEngine, diskStorage, memoryStorage } from "multer";
import path from "node:path";

import { AppCommand } from "../AppCommand.js";
import type { ConfigData } from "../config.data.js";
import { AttachmentController } from "./attachment.controller.js";
import { PushDtoTransformPipe } from "./data/push.dto.js";
import { S3Service, S3_COMMAND } from "./s3.service.js";
import { SyncController } from "./sync.controller.js";
import { SyncService } from "./sync.service.js";

@Module({
	controllers: [SyncController, AttachmentController],
	providers: [
		SyncService,
		S3Service,
		{
			provide: APP_PIPE,
			useClass: PushDtoTransformPipe,
		},
		{
			provide: AppCommand,
			useValue: [S3_COMMAND],
		},
	],
	imports: [
		MulterModule.registerAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService<ConfigData>) => {
				let storage: StorageEngine | undefined = undefined;

				const maxUploadSize = configService.getOrThrow("MAX_UPLOAD_SIZE", { infer: true });
				const tmpUploadDirRawValue = configService.get("TMP_UPLOAD_DIR", { infer: true });
				if (maxUploadSize !== 0 && tmpUploadDirRawValue) {
					const tmpUploadDir = path.resolve(tmpUploadDirRawValue);

					if (!fs.existsSync(tmpUploadDir)) {
						throw new Error(
							"TMP_UPLOAD_DIR set to path that doesn't exist: " + tmpUploadDir,
						);
					}

					if (!fs.statSync(tmpUploadDir).isDirectory()) {
						throw new Error(
							"TMP_UPLOAD_DIR set to path that is not a directory: " + tmpUploadDir,
						);
					}

					try {
						fs.accessSync(tmpUploadDir, fs.constants.R_OK | fs.constants.W_OK);
					} catch {
						throw new Error(
							"TMP_UPLOAD_DIR set to path without read/write permissions: " +
								tmpUploadDir,
						);
					}

					storage = diskStorage({
						destination: tmpUploadDir,
					});
				}

				return {
					storage: storage ? storage : memoryStorage(),
					limits: {
						fileSize: configService.getOrThrow("MAX_UPLOAD_SIZE", { infer: true }),
					},
				};
			},
		}),
	],
})
export class SyncModule {}

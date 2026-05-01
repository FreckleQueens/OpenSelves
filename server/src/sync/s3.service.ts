import {
	DeleteObjectsCommand,
	GetObjectCommand,
	ListObjectsCommand,
	type ListObjectsCommandOutput,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { confirm } from "@inquirer/prompts";
import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type Request } from "express";
import { createReadStream } from "node:fs";

import { AppCommand } from "../AppCommand.js";
import type { ConfigData } from "../config.data.js";

class TransactionAlreadyCommitedError extends Error {
	constructor() {
		super("Transaction was already commited.");
	}
}

class S3Transaction {
	private readonly uploadedFiles: string[] = [];

	private readonly filesToUpload: { file: Express.Multer.File; key: string }[] = [];
	private readonly filesToDelete: string[] = [];

	private isCommitted: boolean = false;

	constructor(
		private readonly bucketName?: string,
		private readonly client?: S3Client,
	) {}

	public queueUploadFile(file: Express.Multer.File, key: string) {
		if (!this.bucketName || !this.client) {
			throw new Error("S3 service is not available.");
		}

		this.filesToUpload.push({ file, key });
	}

	public queueDeleteFile(key: string) {
		if (!this.bucketName || !this.client) {
			throw new Error("S3 service is not available.");
		}

		this.filesToDelete.push(key);
	}

	public async uploadFile(file: Express.Multer.File, key: string) {
		if (!this.bucketName || !this.client) {
			throw new Error("S3 service is not available.");
		}

		const command = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: key,
			Body: createReadStream(file.path),
			ContentType: file.mimetype,
			ContentLength: file.size,
		});
		this.uploadedFiles.push(key);
		await this.client.send(command);
	}

	public async deleteFiles(keys: string[]) {
		if (!this.bucketName || !this.client) {
			throw new Error("S3 service is not available.");
		}

		const command = new DeleteObjectsCommand({
			Bucket: this.bucketName,
			Delete: {
				Objects: keys.map((key) => ({
					Key: key,
				})),
			},
		});
		await this.client.send(command);
	}

	public abort() {
		throw new Error("Transaction aborted");
	}

	async _commit() {
		if (this.isCommitted) {
			throw new TransactionAlreadyCommitedError();
		}
		this.isCommitted = true;

		for (const { file, key } of this.filesToUpload) {
			await this.uploadFile(file, key);
		}
		if (this.filesToDelete.length > 0) {
			await this.deleteFiles(this.filesToDelete);
		}
	}

	async _rollback() {
		if (!this.bucketName || !this.client) {
			return;
		}

		if (this.uploadedFiles.length > 0) {
			const command = new DeleteObjectsCommand({
				Bucket: this.bucketName,
				Delete: {
					Objects: this.uploadedFiles.map((key) => ({ Key: key })),
				},
			});
			await this.client.send(command);
		}
	}
}

@Injectable()
export class S3Service implements OnApplicationShutdown {
	private readonly bucketName?: string;
	private readonly s3Client?: S3Client;

	constructor(private readonly configService: ConfigService<ConfigData>) {
		const maxUploadSize = configService.getOrThrow("MAX_UPLOAD_SIZE", { infer: true });
		if (maxUploadSize === 0) {
			return;
		}

		this.bucketName = configService.getOrThrow("S3_BUCKET", { infer: true });
		this.s3Client = new S3Client({
			endpoint: configService.getOrThrow("S3_ENDPOINT", { infer: true }),
			region: configService.getOrThrow("S3_REGION", { infer: true }),
			credentials: {
				accessKeyId: configService.getOrThrow("S3_ACCESS_KEY", { infer: true }),
				secretAccessKey: configService.getOrThrow("S3_SECRET_KEY", { infer: true }),
			},
		});
	}

	public onApplicationShutdown() {
		this.s3Client?.destroy();
	}

	public async transaction(callback: (tx: S3Transaction) => Promise<void> | void) {
		const transaction = new S3Transaction(this.bucketName, this.s3Client);
		try {
			await callback(transaction);
			await transaction._commit();
		} catch (error) {
			if (!(error instanceof TransactionAlreadyCommitedError)) {
				await transaction._rollback();
			}
			throw error;
		}
	}

	public async getObject(key: string, request: Request) {
		if (!this.bucketName || !this.s3Client) {
			throw new Error("S3 service is not available.");
		}

		return this.s3Client.send(
			new GetObjectCommand({
				Bucket: this.bucketName,
				Key: key,
				IfNoneMatch: request.headers["if-none-match"],
			}),
		);
	}

	public async wipeDevBucket(silent: boolean) {
		if (this.configService.getOrThrow("CLI_ENV", { infer: true }) !== "development") {
			throw new Error(
				"This command is only available in development environment! Using this in production *will* wipe your configured s3 bucket.",
			);
		}

		if (!this.bucketName || !this.s3Client) {
			throw new Error("S3 service is not available.");
		}

		if (!silent) {
			const answer = await confirm({
				message:
					"Are you sure you want to wipe (empty) bucket " +
					this.bucketName +
					"? This is irreversible.",
				default: false,
			});

			if (!answer) {
				return;
			}
		}

		console.log("Wiping dev bucket...");

		let listObjectsCommandOutput: ListObjectsCommandOutput;
		let batch = 0;
		do {
			console.log("Batch", batch++);
			listObjectsCommandOutput = await this.s3Client.send(
				new ListObjectsCommand({
					Bucket: this.bucketName,
				}),
			);
			if (listObjectsCommandOutput.Contents && listObjectsCommandOutput.Contents.length > 0) {
				await this.s3Client.send(
					new DeleteObjectsCommand({
						Bucket: this.bucketName,
						Delete: {
							Objects: listObjectsCommandOutput.Contents.map((obj) => ({
								Key: obj.Key,
							})),
						},
					}),
				);
			} else {
				console.log("No more objects to delete");
			}
		} while (listObjectsCommandOutput.IsTruncated);
		console.log("Done!");
	}
}

export const S3_COMMAND = new AppCommand("s3");
S3_COMMAND.command("wipe-dev-bucket")
	.description(
		"Wipes the configured S3 bucket. (deletes all contained objects, not the bucket itself)",
	)
	.option("--silent", "Do not ask for confirmation before wiping the bucket.", false)
	.action(async function ({ silent }: { silent: boolean }) {
		const { app } = this.getContext();
		const s3Service = app.get(S3Service);
		return s3Service.wipeDevBucket(silent);
	});

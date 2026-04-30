import {
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	ListObjectsCommand,
	type ListObjectsCommandOutput,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { confirm } from "@inquirer/prompts";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createReadStream } from "node:fs";

import { AppCommand } from "../AppCommand.js";
import type { ConfigData } from "../config.data.js";

class S3Transaction {
	private readonly uploadedFiles: string[] = [];
	constructor(
		private readonly bucketName: string,
		private readonly client: S3Client,
	) {}

	public async uploadFile(file: Express.Multer.File, key: string) {
		const command = new PutObjectCommand({
			Bucket: this.bucketName,
			Key: key,
			Body: createReadStream(file.path),
		});
		this.uploadedFiles.push(key);
		await this.client.send(command);
	}

	public abort() {
		throw new Error("Transaction aborted");
	}

	async rollback() {
		for (const key of this.uploadedFiles) {
			const command = new DeleteObjectCommand({
				Bucket: this.bucketName,
				Key: key,
			});
			await this.client.send(command);
		}
	}
}

@Injectable()
export class S3Service {
	private readonly bucketName: string;
	private readonly s3Client: S3Client;

	constructor(private readonly configService: ConfigService<ConfigData>) {
		// TODO: make S3 config optional
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

	public async transaction(callback: (tx: S3Transaction) => Promise<void>) {
		const transaction = new S3Transaction(this.bucketName, this.s3Client);
		try {
			await callback(transaction);
		} catch (error) {
			await transaction.rollback();
			throw error;
		}
	}

	// TODO: attachment service get by key !!authenticated!!
	public async getObject(key: string) {
		return this.s3Client.send(
			new GetObjectCommand({
				Bucket: this.bucketName,
				Key: key,
			}),
		);
	}

	public async wipeDevBucket(silent: boolean) {
		if (this.configService.getOrThrow("CLI_ENV", { infer: true }) !== "development") {
			throw new Error(
				"This command is only available in development environment! Using this in production *will* wipe your configured s3 bucket.",
			);
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

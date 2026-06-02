import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { ConfigData } from "../../config.data.js";
import { QueueService } from "../../queue/queue.service.js";
import { type IMail, Mail } from "./mail.js";
import { SendMailJob } from "./send-mail.job.js";

@Injectable()
export class MailService {
	constructor(
		private readonly config: ConfigService<ConfigData>,
		private readonly queueService: QueueService,
	) {}

	public async send(mail: IMail): Promise<void> {
		await this.queueService.queue(new SendMailJob(undefined, mail));
	}

	public async sendServiceEmail(to: string, subject: string, body: string): Promise<void> {
		await this.send(
			new Mail(
				to,
				this.config.getOrThrow("EMAIL_FROM_ADDRESS", { infer: true }),
				this.config.getOrThrow("EMAIL_FROM_NAME", { infer: true }),
				subject,
				[
					body,
					"",
					"This email is intended for " +
						to +
						" and was sent by the OpenSelves instance at " +
						this.config.getOrThrow("PUBLIC_URL", { infer: true }),
				].join("\n"),
			),
		);
	}
}

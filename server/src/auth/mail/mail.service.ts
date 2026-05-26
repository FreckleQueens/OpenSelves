import { Injectable } from "@nestjs/common";

import { QueueService } from "../../queue/queue.service.js";
import type { IMail } from "./mail.js";
import { SendMailJob } from "./send-mail.job.js";

@Injectable()
export class MailService {
	constructor(private readonly queueService: QueueService) {}

	public async send(mail: IMail): Promise<void> {
		await this.queueService.queue(new SendMailJob(undefined, mail));
	}
}

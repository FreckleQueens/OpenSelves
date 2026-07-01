import { type ChildProcess, spawn } from "node:child_process";
import type { Job as DbJob } from "openselves-common/db";

import { Job } from "../../queue/job.js";
import type { IMail } from "./mail.js";

type SendMailJobData = {
	mail?: IMail;
};

export class SendMailJob extends Job<"SEND_MAIL", SendMailJobData> {
	public static readonly type = "SEND_MAIL";

	public constructor(dbJob?: DbJob, mail?: IMail) {
		super(
			SendMailJob,
			dbJob || {
				data: {
					mail: mail,
				},
			},
		);
		this.assertValidData(this.data);
		if (mail) {
			this.data.mail = mail;
		}
	}

	public get shouldDeleteOnSuccess() {
		return true;
	}

	protected assertValidData(value: unknown): asserts value is SendMailJobData {
		if (!value || typeof value !== "object") {
			throw new Error("Value is missing or malformed for type SendMailJobData", {
				cause: value,
			});
		}
	}

	protected runJob(): Promise<void> {
		this.assertValidData(this.data);
		const mail = this.data.mail;
		if (!mail) {
			throw new Error("Job mail data not defined", { cause: mail });
		}

		const args: string[] = ["-f", mail.from, mail.to];
		const mailContents = this.getMailContents(mail);
		const outputs: string[] = [];

		return new Promise((resolve, reject) => {
			let sendmail: ChildProcess;
			try {
				sendmail = spawn("sendmail", args);
			} catch (error) {
				return reject(
					new Error("Couldn't spawn sendmail child process.", { cause: error }),
				);
			}

			sendmail.on("error", (err) => {
				reject(new Error("Error while spawning sendmail child process", { cause: err }));
			});

			sendmail.stdout?.on("data", (chunk) => {
				if (chunk instanceof Buffer) {
					outputs.push(chunk.toString("utf-8"));
				} else {
					console.log("Unrecognized child process output:", chunk);
				}
			});

			sendmail.stderr?.on("data", (chunk) => {
				if (chunk instanceof Buffer) {
					outputs.push(chunk.toString("utf-8"));
				} else {
					console.log("Unrecognized child process output:", chunk);
				}
			});

			sendmail.once("exit", (code) => {
				if (!code) {
					resolve();
				}

				reject(
					new Error(`Error while sending email. Process exited with code ${code}`, {
						cause: outputs.join("\n"),
					}),
				);
			});

			if (!sendmail.stdin) {
				return reject(new Error("Couldn't get sendmail child process's stdin."));
			}
			sendmail.stdin.end(mailContents);
		});
	}

	private getMailContents(mail: IMail): string {
		const headers: string[] = [
			`To: ${mail.to}`,
			`From: ${mail.fromName} <${mail.from}>`,
			`Subject: ${mail.subject}`,
			`Mime-Version: 1.0`,
			`Content-Type: text/plain`,
		];
		return [...headers, "", mail.body].join("\n");
	}
}

Job.registerJobType(SendMailJob);

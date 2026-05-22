import { Injectable } from "@nestjs/common";
import { type ChildProcess, spawn } from "node:child_process";

import type { IMail } from "./mail.js";

@Injectable()
export class MailService {
	public async send(mail: IMail): Promise<void> {
		const args: string[] = ["-f", mail.from, mail.to];
		const mailContents = await this.getMailContents(mail);
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

	private async getMailContents(mail: IMail): Promise<string> {
		const headers: string[] = [
			`To: ${mail.to}`,
			`From: ${mail.fromName} <${mail.from}>`,
			`Subject: ${mail.subject}`,
			`Mime-Version: 1.0`,
			`Content-Type: text/plain`,
		];
		return [...headers, "", await mail.getBody()].join("\n");
	}
}

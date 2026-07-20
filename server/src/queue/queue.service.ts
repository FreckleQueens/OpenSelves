import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { and, asc, eq, isNull, lt } from "drizzle-orm";

import { DB } from "../db/drizzle.js";
import { jobs } from "../db/index.js";
import { type IJob, Job, MAX_JOB_ATTEMPTS } from "./job.js";

@Injectable()
export class QueueService implements OnApplicationShutdown {
	private readonly runnerInterval: NodeJS.Timeout | undefined;
	private nextCheckTimeout: NodeJS.Timeout | undefined;
	private mayHaveJobsInDb: boolean = true;
	private isRunning: boolean = false;
	private failedJobs: number = 0;
	private flushJobsCallback: (() => void) | undefined;

	constructor(private readonly db: DB) {
		this.runnerInterval = setInterval(() => {
			this.run().catch((err) => {
				console.error("Uncaught error in QueueService.run()", err);
			});
		}, 100);
	}

	onApplicationShutdown() {
		clearInterval(this.runnerInterval);
	}

	public getFailedJobs(): number {
		return this.failedJobs;
	}

	public isIdle(): boolean {
		return !this.isRunning && !this.mayHaveJobsInDb && !this.nextCheckTimeout;
	}

	public resetFailedJobs() {
		this.failedJobs = 0;
	}

	public async flushJobs(): Promise<void> {
		await new Promise<void>((resolve) => {
			if (this.isIdle()) {
				resolve();
			} else {
				this.flushJobsCallback = () => {
					this.flushJobsCallback = undefined;
					resolve();
				};
			}
		});
	}

	public async queue(job: IJob) {
		await this.db.insert(jobs).values(job.toDb());
		this.mayHaveJobsInDb = true;
	}

	private async run(): Promise<void> {
		if (this.isRunning || !this.mayHaveJobsInDb) {
			return;
		}

		if (this.nextCheckTimeout) {
			clearTimeout(this.nextCheckTimeout);
			this.nextCheckTimeout = undefined;
		}

		this.isRunning = true;

		try {
			let err: unknown = undefined;
			await this.db.transaction(async (tx) => {
				const dbJob = (
					await tx
						.select()
						.from(jobs)
						.where(and(isNull(jobs.completedAt), lt(jobs.attempts, MAX_JOB_ATTEMPTS)))
						.orderBy(asc(jobs.scheduledAt))
						.limit(1)
						.for("update", {
							skipLocked: true,
						})
				)[0];
				if (!dbJob) {
					this.mayHaveJobsInDb = false;
					return;
				}

				const timeToScheduled = dbJob.scheduledAt.getTime() - Date.now();
				if (!this.flushJobsCallback && timeToScheduled > 0) {
					this.mayHaveJobsInDb = false;
					this.nextCheckTimeout = setTimeout(() => {
						this.mayHaveJobsInDb = true;
					}, timeToScheduled);
					return;
				}

				const job = Job.fromDb(dbJob);
				try {
					await job.run();
				} catch (e) {
					err = e;
				}

				const values = job.toDb();
				if (err && values.attempts >= MAX_JOB_ATTEMPTS) {
					this.failedJobs++;
				}
				if (values.completedAt && job.shouldDeleteOnSuccess) {
					await tx.delete(jobs).where(eq(jobs.id, dbJob.id));
				} else {
					await tx.update(jobs).set(values).where(eq(jobs.id, dbJob.id));
				}
			});

			if (err) {
				// eslint-disable-next-line @typescript-eslint/only-throw-error
				throw err;
			}
		} finally {
			this.isRunning = false;
			if (this.isIdle()) {
				this.flushJobsCallback?.();
			}
		}
	}
}

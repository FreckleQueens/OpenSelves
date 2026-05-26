import type { JSONCompatible } from "openselves-common";
import type { ServerJob, ServerJobCreate } from "openselves-common/db";

export type JobType<
	TypeDbName extends string,
	Data extends JSONCompatible<Data>,
	Class extends Job<TypeDbName, Data> = Job<TypeDbName, Data>,
> = {
	type: TypeDbName;
	new (dbJob: ServerJob): Class;
};

export interface IJob {
	get shouldDeleteOnSuccess(): boolean;
	toDb(): ServerJobCreate;
	run(): Promise<void>;
}

export const MAX_JOB_ATTEMPTS = 3;
export const ADDITIONAL_DELAY_PER_ATTEMPT = 5 * 1000;

export abstract class Job<
	TypeDbName extends string,
	Data extends JSONCompatible<Data>,
> implements IJob {
	private static jobTypes: Map<
		string,
		{
			new (dbJob: ServerJob): IJob;
		}
	> = new Map();
	public static registerJobType<TypeDbName extends string, Data extends JSONCompatible<Data>>(
		jobType: JobType<TypeDbName, Data>,
	) {
		this.jobTypes.set(jobType.type, jobType);
	}

	public static fromDb(dbJob: ServerJob): IJob {
		const jobType = this.jobTypes.get(dbJob.type);
		if (!jobType) {
			throw new Error("No queue found for name " + dbJob.type);
		}
		return new jobType(dbJob);
	}

	protected readonly typeDbName: TypeDbName;
	protected readonly data: Data | undefined;
	private _attempts: number;
	private completedAt: Date | undefined = undefined;
	protected readonly createdAt: Date | undefined;

	protected constructor(jobType: JobType<TypeDbName, Data>, dbJob?: Partial<ServerJob>) {
		this.typeDbName = jobType.type;
		if (dbJob) {
			this.assertValidData(dbJob.data);
			this.data = dbJob.data;
		}
		this._attempts = dbJob?.attempts || 0;
		this.createdAt = dbJob?.createdAt;
	}

	public toDb(): ServerJobCreate {
		return {
			type: this.typeDbName,
			data: this.data,
			attempts: this.attempts,
			scheduledAt: this.getScheduledAt(),
			completedAt: this.completedAt,
		};
	}

	public get attempts(): number {
		return this._attempts;
	}

	public async run(): Promise<void> {
		this._attempts++;
		await this.runJob();
		this.completedAt = new Date();
	}

	public abstract get shouldDeleteOnSuccess(): boolean;
	protected abstract assertValidData(value: unknown): asserts value is Data;
	protected abstract runJob(): Promise<void>;

	private getScheduledAt(): Date {
		const delay = this.attempts * ADDITIONAL_DELAY_PER_ATTEMPT;
		return new Date(Date.now() + delay);
	}
}

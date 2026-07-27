import { Timestamp } from "./Timestamp.js";

export class TimeRange {
	public static is(value: unknown): value is TimeRange {
		return !!(
			value &&
			typeof value === "object" &&
			"start" in value &&
			Timestamp.is(value.start) &&
			"end" in value &&
			(value.end === undefined || Timestamp.is(value.end))
		);
	}

	public constructor(
		public readonly start: Timestamp,
		public readonly end: Timestamp | undefined,
	) {}
}

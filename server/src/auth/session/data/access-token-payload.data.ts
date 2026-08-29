export class AccessTokenPayload {
	constructor(
		// uniqueId and timestamp are used to produce a different string each time
		public readonly uniqueId: string,
		public readonly timestampMs: number,
		public readonly userKey: string,
	) {}
}

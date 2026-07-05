import {
	type Entry,
	type EntryWithPayload,
	fromJsonFriendlyMaybeWithPayload,
	hashPayload,
	isEntry,
	isEntryWithPayload,
	isJsonFriendlyEntry,
	j2000Now,
	verifyPayload,
} from "../index.js";

export class EntryWrapper implements Entry {
	public static async create(
		namespaceId: string,
		subspaceId: string,
		path: string,
		timestamp: bigint,
		payload: string,
	): Promise<EntryWrapper> {
		return new EntryWrapper(
			{
				namespaceId,
				subspaceId,
				path,
				timestamp,
				payloadLength: BigInt(payload.length),
				payloadDigest: await hashPayload(payload),
			},
			payload,
		);
	}

	public static async load(entry: unknown, payload?: string): Promise<EntryWrapper> {
		let parsedEntry: Entry | EntryWithPayload;
		if (isJsonFriendlyEntry(entry)) {
			parsedEntry = fromJsonFriendlyMaybeWithPayload(entry);
		} else if (!isEntry(entry)) {
			throw new Error("entry is invalid", { cause: entry });
		} else {
			parsedEntry = entry;
		}

		const entryObject = new EntryWrapper(parsedEntry);

		if (typeof payload !== "string" && isEntryWithPayload(parsedEntry)) {
			payload = parsedEntry.payload;
		}

		if (typeof payload === "string") {
			await entryObject.loadPayload(payload);
		}

		return entryObject;
	}

	private readonly _entry: Entry;

	private constructor(
		entry: Entry,
		public payload?: string,
	) {
		this._entry = {
			namespaceId: entry.namespaceId,
			subspaceId: entry.subspaceId,
			path: entry.path,
			timestamp: entry.timestamp,
			payloadLength: entry.payloadLength,
			payloadDigest: entry.payloadDigest,
		};
	}

	public get entry(): Entry {
		return { ...this._entry };
	}

	public get entryWithPayload(): EntryWithPayload {
		if (typeof this.payload === "string") {
			return { ...this._entry, payload: this.payload };
		} else {
			throw new Error("this entry doesn't have a payload");
		}
	}

	public get entryMaybeWithPayload(): Entry | EntryWithPayload {
		if (typeof this.payload === "string") {
			return this.entryWithPayload;
		} else {
			return this.entry;
		}
	}

	public get namespaceId(): string {
		return this._entry.namespaceId;
	}

	public get subspaceId(): string {
		return this._entry.subspaceId;
	}

	public get path(): string {
		return this._entry.path;
	}

	public get timestamp(): bigint {
		return this._entry.timestamp;
	}

	public get payloadLength(): bigint {
		return this._entry.payloadLength;
	}

	public get payloadDigest(): string {
		return this._entry.payloadDigest;
	}

	public async loadPayload(payload: string) {
		if (typeof this.payload === "string") {
			throw new Error("Payload already loaded");
		}

		const entry = this.entry;
		const verifyResult = await verifyPayload(payload, entry.payloadLength, entry.payloadDigest);
		if (!verifyResult.isSuccess) {
			throw new Error("Tried to load invalid payload", {
				cause: {
					verifyResult,
					entry: this.entry,
					entryWrapper: this,
					payload,
				},
			});
		}

		this.payload = payload;
	}

	public async setPayload(payload: string, timestamp: bigint = j2000Now()) {
		const length = BigInt(payload.length);
		const digest = await hashPayload(payload);
		this._entry.timestamp = timestamp;
		this._entry.payloadDigest = digest;
		this._entry.payloadLength = length;
		this.payload = payload;
	}
}

import { ByteString } from "../ByteString.js";
import { Path } from "../Path.js";
import {
	Entry,
	EntryWithPayload,
	NamespaceId,
	PayloadDigest,
	SubspaceId,
	Timestamp,
	UInt64,
} from "../index.js";

export class EntryWrapper implements Entry {
	public static async create(
		namespaceId: ByteString,
		subspaceId: ByteString,
		path: Path,
		timestamp: Timestamp,
		payload: ByteString,
	): Promise<EntryWrapper> {
		return new EntryWrapper(
			{
				namespaceId,
				subspaceId,
				path,
				timestamp,
				payloadLength: BigInt(payload.length),
				payloadDigest: await PayloadDigest.hash(payload),
			},
			payload,
		);
	}

	public static async load(entry: unknown, payload?: ByteString): Promise<EntryWrapper> {
		if (!Entry.is(entry) || !Entry.isValid(entry)) {
			throw new Error("Tried to load an invalid entry", {
				cause: entry,
			});
		}

		const entryObject = new EntryWrapper(entry);

		if (payload === undefined && EntryWithPayload.is(entry)) {
			payload = entry.payload;
		}

		if (payload) {
			await entryObject.loadPayload(payload);
		}

		return entryObject;
	}

	private readonly _entry: Entry;
	private _payload: ByteString | undefined;

	private constructor(entry: Entry, payload?: ByteString) {
		this._entry = Entry.copy(entry);

		if (payload) {
			this._payload = ByteString.copy(payload);
		}
	}

	public get entry(): Entry {
		return Entry.copy(this._entry);
	}

	public get entryWithPayload(): EntryWithPayload {
		if (this._payload) {
			return { ...Entry.copy(this._entry), payload: ByteString.copy(this._payload) };
		} else {
			throw new Error("this entry doesn't have a payload");
		}
	}

	public get entryMaybeWithPayload(): Entry | EntryWithPayload {
		if (this._payload) {
			return this.entryWithPayload;
		} else {
			return this.entry;
		}
	}

	public get namespaceId(): ByteString {
		return NamespaceId.copy(this._entry.namespaceId);
	}

	public get subspaceId(): ByteString {
		return SubspaceId.copy(this._entry.subspaceId);
	}

	public get path(): Path {
		return Path.copy(this._entry.path);
	}

	public get timestamp(): Timestamp {
		return this._entry.timestamp;
	}

	public get payloadLength(): UInt64 {
		return this._entry.payloadLength;
	}

	public get payloadDigest(): PayloadDigest {
		return PayloadDigest.copy(this._entry.payloadDigest);
	}

	public get payload(): ByteString | undefined {
		return this._payload ? ByteString.copy(this._payload) : undefined;
	}

	public async loadPayload(payload: ByteString) {
		if (this._payload) {
			throw new Error("Payload already loaded");
		}

		if (
			BigInt(payload.length) !== this._entry.payloadLength ||
			!(await PayloadDigest.verify(this._entry.payloadDigest, payload))
		) {
			throw new Error("Tried to load invalid payload", {
				cause: {
					entry: this.entry,
					entryWrapper: this,
					payload,
				},
			});
		}

		this._payload = ByteString.copy(payload);
	}

	public async setPayload(payload: ByteString, timestamp: Timestamp = Timestamp.now()) {
		const length: UInt64 = BigInt(payload.length);
		const digest: PayloadDigest = await PayloadDigest.hash(payload);
		this._entry.timestamp = timestamp;
		this._entry.payloadDigest = digest;
		this._entry.payloadLength = length;
		this._payload = ByteString.copy(payload);
	}
}

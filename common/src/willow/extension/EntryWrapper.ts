import { ByteString } from "../ByteString.js";
import { Path } from "../Path.js";
import {
	AuthorisedEntryWithPayload,
	Entry,
	NamespaceId,
	PayloadDigest,
	SubspaceId,
	Timestamp,
	UInt64,
} from "../index.js";
import type { CapabilitySignData } from "../meadowcap/CapabilitySignData.js";
import { AuthorisedEntry } from "../meadowcap/index.js";

// TODO: get rid of this class
export class EntryWrapper implements Entry {
	public static async create(
		namespaceId: ByteString,
		subspaceId: ByteString,
		path: Path,
		timestamp: Timestamp,
		payload: ByteString,
		signData: CapabilitySignData,
	): Promise<EntryWrapper> {
		return new EntryWrapper(
			await AuthorisedEntry.signEntry(
				{
					namespaceId,
					subspaceId,
					path,
					timestamp,
					payloadLength: BigInt(payload.length),
					payloadDigest: await PayloadDigest.hash(payload),
				},
				signData,
			),
			payload,
		);
	}

	public static async load(entry: unknown, payload?: ByteString): Promise<EntryWrapper> {
		if (!AuthorisedEntry.is(entry) || !(await AuthorisedEntry.isValid(entry))) {
			throw new Error("Tried to load an invalid entry", {
				cause: entry,
			});
		}

		const entryObject = new EntryWrapper(entry);

		if (payload === undefined && AuthorisedEntryWithPayload.is(entry)) {
			payload = entry.payload;
		}

		if (payload) {
			await entryObject.loadPayload(payload);
		}

		return entryObject;
	}

	private _entry: AuthorisedEntry;
	private _payload: ByteString | undefined;

	private constructor(entry: AuthorisedEntry, payload?: ByteString) {
		this._entry = AuthorisedEntry.copy(entry);

		if (payload) {
			this._payload = ByteString.copy(payload);
		}
	}

	public get entry(): AuthorisedEntry {
		return AuthorisedEntry.copy(this._entry);
	}

	public get entryWithPayload(): AuthorisedEntryWithPayload {
		if (this._payload) {
			return {
				...AuthorisedEntry.copy(this._entry),
				payload: ByteString.copy(this._payload),
			};
		} else {
			throw new Error("this entry doesn't have a payload");
		}
	}

	public get entryMaybeWithPayload(): AuthorisedEntry | AuthorisedEntryWithPayload {
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

	public async setPayload(
		payload: ByteString,
		signData: CapabilitySignData,
		timestamp: Timestamp = Timestamp.now(),
	) {
		this._entry = await AuthorisedEntry.signEntry(
			await Entry.setPayload(this._entry, payload, timestamp),
			signData,
		);
		this._payload = ByteString.copy(payload);
	}
}

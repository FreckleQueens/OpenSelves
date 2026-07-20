import { ByteString } from "../ByteString.js";
import { Entry } from "../Entry.js";
import { Path } from "../Path.js";
import type { PayloadDigest } from "../PayloadDigest.js";
import type { Timestamp } from "../Timestamp.js";
import type { UInt64 } from "../UInt64.js";

export class EntryWithPayload extends Entry {
	public static is(value: unknown): value is EntryWithPayload {
		return Entry.is(value) && ByteString.is(value["payload"]);
	}

	public static copy(entry: EntryWithPayload): EntryWithPayload {
		return {
			...Entry.copy(entry),
			payload: ByteString.copy(entry.payload),
		};
	}

	public static toHumanReadable(entry: EntryWithPayload) {
		return {
			...Entry.toHumanReadable(entry),
			payload: ByteString.toUtf8(entry.payload),
		};
	}

	public static default(): EntryWithPayload {
		return {
			...Entry.default(),
			payload: new Uint8Array(0),
		};
	}

	constructor(
		namespaceId: ByteString,
		subspaceId: ByteString,
		path: Path,
		timestamp: Timestamp,
		payloadLength: UInt64,
		payloadDigest: PayloadDigest,
		public payload: ByteString,
	) {
		super(namespaceId, subspaceId, path, timestamp, payloadLength, payloadDigest);
	}
}

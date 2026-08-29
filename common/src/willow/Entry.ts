import type { ByteProvider } from "./ByteProvider.js";
import { ByteString } from "./ByteString.js";
import { Ed25519Pk } from "./Ed25519.js";
import { NamespaceId } from "./NamespaceId.js";
import { Path } from "./Path.js";
import { PayloadDigest } from "./PayloadDigest.js";
import { SubspaceId } from "./SubspaceId.js";
import { Timestamp } from "./Timestamp.js";
import { UInt64 } from "./UInt64.js";
import { Willow25 } from "./Willow25.js";

export class Entry {
	public static is(value: unknown): value is Entry {
		return !!(
			value &&
			typeof value === "object" &&
			NamespaceId.is(value["namespaceId"]) &&
			SubspaceId.is(value["subspaceId"]) &&
			Path.is(value["path"]) &&
			Timestamp.is(value["timestamp"]) &&
			UInt64.is(value["payloadLength"]) &&
			PayloadDigest.is(value["payloadDigest"])
		);
	}

	public static isValid(entry: Entry): Promise<boolean> {
		return Promise.resolve(
			Path.isValid(entry.path) &&
				Timestamp.isValid(entry.timestamp) &&
				UInt64.isValid(entry.payloadLength) &&
				PayloadDigest.isValid(entry.payloadDigest),
		);
	}

	/**
	 * @returns `true` if e1 is newer than e2, `false` otherwise
	 */
	public static isNewer(e1: Entry, e2: Entry): boolean {
		return (
			e1.timestamp > e2.timestamp ||
			(e1.timestamp === e2.timestamp &&
				PayloadDigest.compare(e1.payloadDigest, e2.payloadDigest) > 0) ||
			(e1.timestamp === e2.timestamp &&
				PayloadDigest.compare(e1.payloadDigest, e2.payloadDigest) === 0 &&
				e1.payloadLength > e2.payloadLength)
		);
	}

	public static copy(entry: Entry): Entry {
		return {
			namespaceId: NamespaceId.copy(entry.namespaceId),
			subspaceId: SubspaceId.copy(entry.subspaceId),
			path: Path.copy(entry.path),
			timestamp: entry.timestamp,
			payloadLength: entry.payloadLength,
			payloadDigest: PayloadDigest.copy(entry.payloadDigest),
		};
	}

	/**
	 * @param entry
	 * @param payload
	 * @param timestamp `null` skips timestamp update
	 * @returns an updated copy of entry
	 */
	public static async setPayload(
		entry: Entry,
		payload: ByteString,
		options?: { timestamp?: Timestamp | null },
	): Promise<Entry> {
		const newEntry = Entry.copy(entry);
		newEntry.payloadLength = BigInt(payload.length);
		newEntry.payloadDigest = await PayloadDigest.hash(payload);

		const timestamp = options?.timestamp;
		if (timestamp !== null) {
			newEntry.timestamp = timestamp === undefined ? Timestamp.now() : timestamp;
		}

		return newEntry;
	}

	public static toHumanReadable(entry: Entry) {
		return {
			namespaceId: NamespaceId.toUtf8(entry.namespaceId),
			subspaceId: SubspaceId.toUtf8(entry.subspaceId),
			path: Path.toString(entry.path),
			timestamp: entry.timestamp.toString(),
			payloadLength: entry.payloadLength.toString(),
			payloadDigest: PayloadDigest.toUtf8(entry.payloadDigest),
		};
	}

	/**
	 * According to https://willowprotocol.org/specs/willow25/index.html#willow25_defaults
	 */
	public static default(): Entry {
		return {
			namespaceId: Ed25519Pk.copy(Willow25.DEFAULT_NAMESPACE_ID),
			subspaceId: Ed25519Pk.copy(Willow25.DEFAULT_SUBSPACE_ID),
			path: [],
			timestamp: 0n,
			payloadLength: 0n,
			// The William3 digest of the empty string
			payloadDigest: PayloadDigest.copy(Willow25.DEFAULT_PAYLOAD_DIGEST),
		};
	}

	/**
	 * https://willowprotocol.org/specs/encodings/index.html#encsec_EncodeEntry
	 */
	public static encode(entry: Entry): ByteString {
		const parts: ByteString[] = [];

		parts.push(NamespaceId.encode(entry.namespaceId));
		parts.push(SubspaceId.encode(entry.subspaceId));
		parts.push(Path.encode(entry.path));
		parts.push(UInt64.encodeToVariable8(entry.timestamp));
		parts.push(UInt64.encodeToVariable8(entry.payloadLength));
		parts.push(PayloadDigest.encode(entry.payloadDigest));

		return ByteString.concat(...parts);
	}

	public static async decode(provider: ByteProvider, canonic: boolean): Promise<Entry> {
		const namespaceId = await NamespaceId.decode(provider);
		const subspaceId = await SubspaceId.decode(provider);
		const path = await Path.decode(provider, canonic);
		const timestamp = await UInt64.decodeVariable8(provider, canonic);
		const payloadLength = await UInt64.decodeVariable8(provider, canonic);
		const payloadDigest = await PayloadDigest.decode(provider);

		return {
			namespaceId,
			subspaceId,
			path,
			timestamp,
			payloadLength,
			payloadDigest,
		};
	}

	public constructor(
		public namespaceId: NamespaceId,
		public subspaceId: SubspaceId,
		public path: Path,
		public timestamp: Timestamp,
		public payloadLength: UInt64,
		public payloadDigest: PayloadDigest,
	) {}
}

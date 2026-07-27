import { ByteString } from "../ByteString.js";
import { Entry } from "../Entry.js";
import type { NamespaceId } from "../NamespaceId.js";
import type { Path } from "../Path.js";
import { PayloadDigest } from "../PayloadDigest.js";
import type { SubspaceId } from "../SubspaceId.js";
import type { Timestamp } from "../Timestamp.js";
import {
	type AuthorisationToken,
	AuthorisedEntry,
	CapabilitySignData,
} from "../meadowcap/index.js";

export class AuthorisedEntryWithPayload extends AuthorisedEntry {
	public static is(value: unknown): value is AuthorisedEntryWithPayload {
		return AuthorisedEntry.is(value) && ByteString.is(value["payload"]);
	}

	public static copy(entry: AuthorisedEntryWithPayload): AuthorisedEntryWithPayload {
		return {
			...AuthorisedEntry.copy(entry),
			payload: ByteString.copy(entry.payload),
		};
	}

	public static default(): AuthorisedEntryWithPayload {
		return {
			...AuthorisedEntry.default(),
			payload: ByteString.empty(),
		};
	}

	public static async create(
		namespaceId: NamespaceId,
		subspaceId: SubspaceId,
		path: Path,
		timestamp: Timestamp,
		payload: ByteString,
		signData: CapabilitySignData,
	): Promise<AuthorisedEntryWithPayload> {
		const entry: Entry = {
			namespaceId,
			subspaceId,
			path,
			timestamp,
			payloadLength: BigInt(payload.length),
			payloadDigest: await PayloadDigest.hash(payload),
		};
		return this.signEntry(
			{
				...entry,
				payload,
			},
			signData,
		);
	}

	public static override async signEntry(
		entry: Entry & {
			payload: ByteString;
		},
		signData: CapabilitySignData,
	): Promise<AuthorisedEntryWithPayload> {
		return {
			...(await super.signEntry(entry, signData)),
			payload: entry.payload,
		};
	}

	constructor(
		entry: Entry,
		authorisationToken: AuthorisationToken,
		public payload: ByteString,
	) {
		super(entry, authorisationToken);
	}
}

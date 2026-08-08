import { Area } from "../Area.js";
import type { ByteString } from "../ByteString.js";
import { Ed25519 } from "../Ed25519.js";
import { Entry } from "../Entry.js";
import { NamespaceId } from "../NamespaceId.js";
import type { Path } from "../Path.js";
import type { PayloadDigest } from "../PayloadDigest.js";
import type { SubspaceId } from "../SubspaceId.js";
import { Timestamp } from "../Timestamp.js";
import type { UInt64 } from "../UInt64.js";
import { Willow25 } from "../Willow25.js";
import { AuthorisationToken } from "./AuthorisationToken.js";
import { Capability, CapabilityAccessMode } from "./Capability.js";
import type { CapabilitySignData } from "./CapabilitySignData.js";

export class AuthorisedEntry extends Entry {
	public static is(value: unknown): value is AuthorisedEntry {
		return !!(
			Entry.is(value) &&
			"authorisationToken" in value &&
			AuthorisationToken.is(value.authorisationToken)
		);
	}

	public static override async isValid(value: AuthorisedEntry): Promise<boolean> {
		return (await super.isValid(value)) && (await AuthorisedEntry.isAuthorisedWrite(value));
	}

	public static copy(authorisedEntry: AuthorisedEntry): AuthorisedEntry {
		return {
			...Entry.copy(authorisedEntry),
			authorisationToken: AuthorisationToken.copy(authorisedEntry.authorisationToken),
		};
	}

	public static default(): AuthorisedEntry {
		const entry = Entry.default();
		return {
			...entry,
			authorisationToken: {
				capability: Capability.default(),
				signature: Willow25.DEFAULT_AUTHORISATION_TOKEN_SIGNATURE,
			},
		};
	}

	public static async signEntry(
		entry: Entry,
		signData: CapabilitySignData,
	): Promise<AuthorisedEntry> {
		const signature = await Ed25519.sign(signData.secretKey, Entry.encodeEntry(entry));
		let capability: Capability;
		if (NamespaceId.isCommunal(entry.namespaceId)) {
			capability = Capability.create(
				CapabilityAccessMode.WRITE,
				entry.namespaceId,
				entry.subspaceId,
				signData.delegations || [],
			);
		} else {
			throw new Error("Creating AuthorisedEntry in owned namespace is not implemented");
		}
		return {
			...Entry.copy(entry),
			authorisationToken: {
				capability,
				signature,
			},
		};
	}

	public static override async setPayload(
		entry: Entry,
		payload: ByteString,
		options: {
			timestamp?: Timestamp | null;
			signData: CapabilitySignData;
		},
	): Promise<AuthorisedEntry> {
		return await this.signEntry(
			await super.setPayload(entry, payload, options),
			options.signData,
		);
	}

	/**
	 * https://willowprotocol.org/specs/meadowcap/index.html#meadowcap_is_authorised_write
	 * TODO: test this thoroughly
	 */
	public static async isAuthorisedWrite(val: AuthorisedEntry): Promise<boolean> {
		const grantedArea = Capability.getGrantedArea(val.authorisationToken.capability);
		const receiver = Capability.getReceiver(val.authorisationToken.capability);
		return (
			val.authorisationToken.capability.inner.accessMode === CapabilityAccessMode.WRITE &&
			Area.includesEntry(grantedArea, val) &&
			(await Capability.isValid(val.authorisationToken.capability)) &&
			(await Ed25519.verify(
				receiver,
				val.authorisationToken.signature,
				Entry.encodeEntry(val),
			))
		);
	}

	public constructor(
		namespaceId: NamespaceId,
		subspaceId: SubspaceId,
		path: Path,
		timestamp: Timestamp,
		payloadLength: UInt64,
		payloadDigest: PayloadDigest,
		public authorisationToken: AuthorisationToken,
	) {
		super(namespaceId, subspaceId, path, timestamp, payloadLength, payloadDigest);
	}
}

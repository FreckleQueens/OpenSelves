import { Area } from "../Area.js";
import { Ed25519 } from "../Ed25519.js";
import { Entry } from "../Entry.js";
import { NamespaceId } from "../NamespaceId.js";
import { Willow25 } from "../Willow25.js";
import { AuthorisationToken } from "./AuthorisationToken.js";
import { Capability, CapabilityAccessMode } from "./Capability.js";
import type { CapabilitySignData } from "./CapabilitySignData.js";

export class AuthorisedEntry implements Entry {
	public static is(value: unknown): value is AuthorisedEntry {
		return !!(
			Entry.is(value) &&
			"authorisationToken" in value &&
			AuthorisationToken.is(value.authorisationToken)
		);
	}

	public static async isValid(value: AuthorisedEntry): Promise<boolean> {
		return Entry.isValid(value) && AuthorisedEntry.isAuthorisedWrite(value);
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
		entry: Entry,
		public authorisationToken: AuthorisationToken,
		public namespaceId = entry.namespaceId,
		public subspaceId = entry.subspaceId,
		public path = entry.path,
		public timestamp = entry.timestamp,
		public payloadLength = entry.payloadLength,
		public payloadDigest = entry.payloadDigest,
	) {}
}

import { Area } from "../Area.js";
import type { ByteProvider } from "../ByteProvider.js";
import { ByteString } from "../ByteString.js";
import type { Entry } from "../Entry.js";
import { NamespaceId } from "../NamespaceId.js";
import type { AuthorisedEntry } from "./AuthorisedEntry.js";
import { Capability } from "./Capability.js";
import { CommunalCapability } from "./CommunalCapability.js";
import { NamespacePublicKey } from "./NamespacePublicKey.js";
import { UserSignature } from "./UserSignature.js";

/**
 * https://willowprotocol.org/specs/meadowcap/index.html#MeadowcapAuthorisationToken
 */
export class AuthorisationToken {
	public static is(value: unknown): value is AuthorisationToken {
		return !!(
			value &&
			typeof value === "object" &&
			"capability" in value &&
			Capability.is(value.capability) &&
			"signature" in value &&
			UserSignature.is(value.signature)
		);
	}

	public static copy(authorisationToken: AuthorisationToken): AuthorisationToken {
		return {
			capability: Capability.copy(authorisationToken.capability),
			signature: UserSignature.copy(authorisationToken.signature),
		};
	}

	/**
	 * https://willowprotocol.org/specs/encodings/index.html#encsec_EncodeMeadowcapAuthorisationTokenRelative
	 */
	public static encodeAuthorisationTokenRelative(
		val: AuthorisationToken,
		rel: {
			authorisedEntry: AuthorisedEntry;
			entry: Entry;
		},
	): ByteString {
		if (
			!NamespacePublicKey.equals(
				Capability.getGrantedNamespace(val.capability),
				rel.entry.namespaceId,
			)
		) {
			throw new Error("capability and entry have different namespaces", {
				cause: {
					val,
					rel,
				},
			});
		}

		if (!Area.includesEntry(Capability.getGrantedArea(val.capability.inner), rel.entry)) {
			throw new Error("entry isn't included in capability's granted area", {
				cause: {
					val,
					rel,
				},
			});
		}

		let encodedCapability: ByteString;
		if (CommunalCapability.is(val.capability.inner)) {
			encodedCapability = CommunalCapability.encodeCommunalCapabilityRelative(
				val.capability.inner,
				rel,
			);
		} else {
			throw new Error("Encoding OwnedCapability is not implemented");
		}
		return ByteString.concat(encodedCapability, UserSignature.encode(val.signature));
	}

	public static async decodeAuthorisationTokenRelative(
		rel: {
			authorisedEntry: AuthorisedEntry;
			entry: Omit<Entry, "payloadDigest">;
		},
		provider: ByteProvider,
	): Promise<AuthorisationToken> {
		const headerByte = (await provider.read(1))[0];
		const isOwned = headerByte >> 7 === 0b1;

		let capabilityInner: Capability["inner"];
		if (isOwned) {
			throw new Error("Decoding owned capabilities is unsupported");
		} else {
			capabilityInner = await CommunalCapability.decodeCommunalCapabilityRelative(
				rel,
				headerByte,
				provider,
			);
		}

		const userSignature = await UserSignature.decode(provider);
		return {
			capability: {
				inner: capabilityInner,
			},
			signature: userSignature,
		};
	}

	public static encodeAuthorisationTokenEntryRelative(
		val: AuthorisationToken,
		rel: Entry,
	): ByteString {
		if (!NamespaceId.equals(Capability.getGrantedNamespace(val.capability), rel.namespaceId)) {
			throw new Error("authorisationToken's granted namespace doesn't match rel", {
				cause: {
					authorisationToken: val,
					rel,
				},
			});
		}

		if (!Area.includesEntry(Capability.getGrantedArea(val.capability), rel)) {
			throw new Error("authorisationToken's granted area doesn't include rel", {
				cause: {
					authorisationToken: val,
					rel,
				},
			});
		}

		let encodedCapability: ByteString;
		if (CommunalCapability.is(val.capability.inner)) {
			encodedCapability = CommunalCapability.encodeCommunalCapabilityEntryRelative(
				val.capability.inner,
				rel,
			);
		} else {
			throw new Error("Encoding OwnedCapability is not implemented");
		}
		return ByteString.concat(encodedCapability, UserSignature.encode(val.signature));
	}

	public static async decodeAuthorisationTokenEntryRelative(
		rel: Entry,
		provider: ByteProvider,
	): Promise<AuthorisationToken> {
		const headerByte = (await provider.read(1))[0];
		const isOwned = headerByte >> 7 === 0b1;

		let capabilityInner: Capability["inner"];
		if (isOwned) {
			throw new Error("Decoding an owned capability is not supported");
		} else {
			capabilityInner = await CommunalCapability.decodeCommunalCapabilityEntryRelative(
				rel,
				headerByte,
				provider,
			);
		}

		const userSignature = await UserSignature.decode(provider);

		return {
			capability: {
				inner: capabilityInner,
			},
			signature: userSignature,
		};
	}

	public constructor(
		public capability: Capability,
		public signature: UserSignature,
	) {}
}

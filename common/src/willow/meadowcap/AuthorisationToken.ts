import { Area } from "../Area.js";
import { ByteString } from "../ByteString.js";
import type { DropDecodeMultiStep, DropDecodeStep } from "../Drop.js";
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

		if (
			!Area.includesEntry(CommunalCapability.getGrantedArea(val.capability.inner), rel.entry)
		) {
			throw new Error("entry isn't included in capability's granted area", {
				cause: {
					val,
					rel,
				},
			});
		}

		let encodedCapability: ByteString;
		if (CommunalCapability.isCommunalCapability(val.capability.inner)) {
			encodedCapability = CommunalCapability.encodeCommunalCapabilityRelative(
				val.capability.inner,
				rel,
			);
		} else {
			throw new Error("Encoding OwnedCapability is not implemented");
		}
		return ByteString.concat(encodedCapability, UserSignature.encode(val.signature));
	}

	public static decodeAuthorisationTokenRelative(
		rel: {
			authorisedEntry: AuthorisedEntry;
			entry: Omit<Entry, "payloadDigest">;
		},
		callback: (result: AuthorisationToken) => void,
	): DropDecodeStep[] {
		let capability: Capability;

		const decodeCapabilityStep: DropDecodeMultiStep = {
			name: "capability",
			steps: [],
		};

		return [
			{
				name: "Detect communal or owned capability",
				consumedBytes: 1,
				decode(bytes) {
					const headerByte = bytes[0];
					const isOwned = headerByte >> 7 === 0b1;
					if (isOwned) {
						throw new Error("Decoding owned capabilities is unsupported");
					} else {
						decodeCapabilityStep.steps.push(
							...CommunalCapability.decodeCommunalCapabilityRelative(
								rel,
								headerByte,
								(result) => {
									capability = {
										inner: result,
									};
								},
							),
						);
					}
				},
			},
			decodeCapabilityStep,
			{
				name: "Decode user signature",
				consumedBytes: UserSignature.LENGTH,
				decode: (bytes) => {
					const { userSignature } = UserSignature.decode(bytes);
					callback({ capability, signature: userSignature });
				},
			},
		];
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
		if (CommunalCapability.isCommunalCapability(val.capability.inner)) {
			encodedCapability = CommunalCapability.encodeCommunalCapabilityEntryRelative(
				val.capability.inner,
				rel,
			);
		} else {
			throw new Error("Encoding OwnedCapability is not implemented");
		}
		return ByteString.concat(encodedCapability, UserSignature.encode(val.signature));
	}

	public static decodeAuthorisationTokenEntryRelative(
		input: ByteString,
		rel: Entry,
	): {
		authorisationToken: AuthorisationToken;
		consumedBytes: number;
	} {
		let consumedBytes = 0;

		const headerByte = input[0];
		const isOwned = headerByte >> 7 === 0b1;

		let capability: Capability;
		if (isOwned) {
			throw new Error("Decoding an owned capability is not supported");
		} else {
			const { capability: decodedCap, consumedBytes: capabilityConsumedBytes } =
				CommunalCapability.decodeCommunalCapabilityEntryRelative(input, rel);
			capability = {
				inner: decodedCap,
			};
			consumedBytes += capabilityConsumedBytes;
		}

		const { userSignature, consumedBytes: userSignatureConsumedBytes } = UserSignature.decode(
			input.slice(consumedBytes),
		);
		consumedBytes += userSignatureConsumedBytes;

		return {
			authorisationToken: {
				capability,
				signature: userSignature,
			},
			consumedBytes,
		};
	}

	public constructor(
		public capability: Capability,
		public signature: UserSignature,
	) {}
}

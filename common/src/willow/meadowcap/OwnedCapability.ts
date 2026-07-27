import { CapabilityAccessMode } from "./Capability.js";
import type { CommunalCapability } from "./CommunalCapability.js";
import { Delegation } from "./Delegation.js";
import { NamespacePublicKey } from "./NamespacePublicKey.js";
import { NamespaceSignature } from "./NamespaceSignature.js";
import { UserPublicKey } from "./UserPublicKey.js";

/**
 * https://willowprotocol.org/specs/meadowcap/index.html#OwnedCapability
 */
export class OwnedCapability {
	public static is(value: unknown): value is OwnedCapability {
		return !!(
			value &&
			typeof value === "object" &&
			"accessMode" in value &&
			(value.accessMode === CapabilityAccessMode.READ ||
				value.accessMode === CapabilityAccessMode.WRITE) &&
			"namespaceKey" in value &&
			NamespacePublicKey.is(value.namespaceKey) &&
			"userKey" in value &&
			UserPublicKey.is(value.userKey) &&
			"initialAuthorisation" in value &&
			NamespaceSignature.is(value.initialAuthorisation) &&
			"delegations" in value &&
			Array.isArray(value.delegations) &&
			value.delegations.every((val: unknown) => Delegation.is(val))
		);
	}

	public static isOwnedCapability(
		val: OwnedCapability | CommunalCapability,
	): val is OwnedCapability {
		return "initialAuthorisation" in val && NamespaceSignature.is(val.initialAuthorisation);
	}

	public constructor(
		public accessMode: CapabilityAccessMode,
		public namespaceKey: NamespacePublicKey,
		public userKey: UserPublicKey,
		public initialAuthorisation: NamespaceSignature,
		public delegations: Delegation[],
	) {}
}

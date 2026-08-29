import { Area } from "../Area.js";
import { ByteString } from "../ByteString.js";
import { Ed25519 } from "../Ed25519.js";
import { NamespaceId } from "../NamespaceId.js";
import { Capability, CapabilityAccessMode } from "./Capability.js";
import { Delegation } from "./Delegation.js";
import { NamespacePublicKey } from "./NamespacePublicKey.js";
import { NamespaceSignature } from "./NamespaceSignature.js";
import { UserPublicKey } from "./UserPublicKey.js";
import { UserSignature } from "./UserSignature.js";

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

	public static async isValid(val: OwnedCapability): Promise<boolean> {
		if (NamespaceId.isCommunal(val.namespaceKey)) {
			return false;
		}

		const finalDelegation = Capability.getFinalDelegation(val);
		if (finalDelegation === undefined) {
			const initialPayload = ByteString.concat(
				ByteString.of(val.accessMode === CapabilityAccessMode.READ ? 0x02 : 0x03),
				UserPublicKey.encode(val.userKey),
			);
			return await Ed25519.verify(val.namespaceKey, val.initialAuthorisation, initialPayload);
		} else {
			const previousCapability: OwnedCapability = {
				accessMode: val.accessMode,
				namespaceKey: val.namespaceKey,
				userKey: val.userKey,
				initialAuthorisation: val.initialAuthorisation,
				delegations: val.delegations.slice(0, val.delegations.length - 1),
			};

			const previousArea = Capability.getGrantedArea(previousCapability);
			const previousReceiver = Capability.getReceiver(previousCapability);

			const newArea = Capability.getGrantedArea(val);
			const newReceiver = Capability.getReceiver(val);

			const handoverPayload: ByteString = OwnedCapability.getHandoverPayload(
				previousCapability,
				previousArea,
				newArea,
				newReceiver,
			);

			return (
				Delegation.isValid(finalDelegation) &&
				Area.includes(previousArea, newArea) &&
				(await OwnedCapability.isValid(previousCapability)) &&
				(await Ed25519.verify(
					previousReceiver,
					finalDelegation.userSignature,
					handoverPayload,
				))
			);
		}
	}

	public static copy(val: OwnedCapability): OwnedCapability {
		return {
			accessMode: val.accessMode,
			namespaceKey: NamespacePublicKey.copy(val.namespaceKey),
			userKey: UserPublicKey.copy(val.userKey),
			initialAuthorisation: UserSignature.copy(val.initialAuthorisation),
			delegations: val.delegations.map((delegation) => Delegation.copy(delegation)),
		};
	}

	public static getHandoverPayload(
		previousCapability: OwnedCapability,
		previousArea: Area,
		newArea: Area,
		newReceiver: UserPublicKey,
	): ByteString {
		const previousDelegation = Capability.getFinalDelegation(previousCapability);
		const previousSignature =
			previousDelegation === undefined
				? previousCapability.initialAuthorisation
				: previousDelegation.userSignature;
		return ByteString.concat(
			Area.encodeAreaInArea(newArea, previousArea),
			UserSignature.encode(previousSignature),
			UserPublicKey.encode(newReceiver),
		);
	}

	public constructor(
		public accessMode: CapabilityAccessMode,
		public namespaceKey: NamespacePublicKey,
		public userKey: UserPublicKey,
		public initialAuthorisation: NamespaceSignature,
		public delegations: Delegation[],
	) {}
}

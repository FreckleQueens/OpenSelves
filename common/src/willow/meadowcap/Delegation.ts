import { Area } from "../Area.js";
import { ByteString } from "../ByteString.js";
import type { SubspaceId } from "../SubspaceId.js";
import { CommunalCapability } from "./CommunalCapability.js";
import { OwnedCapability } from "./OwnedCapability.js";
import { UserPublicKey } from "./UserPublicKey.js";
import { UserSignature } from "./UserSignature.js";

export class Delegation {
	public static is(value: unknown): value is Delegation {
		return !!(
			value &&
			typeof value === "object" &&
			"area" in value &&
			Area.is(value.area) &&
			"userPublicKey" in value &&
			UserPublicKey.is(value.userPublicKey) &&
			"userSignature" in value &&
			UserSignature.is(value.userSignature)
		);
	}

	public static equals(a: Delegation, b: Delegation) {
		return (
			Area.equals(a.area, b.area) &&
			UserPublicKey.equals(a.userPublicKey, b.userPublicKey) &&
			UserSignature.equals(a.userSignature, b.userSignature)
		);
	}

	public static copy(delegation: Delegation): Delegation {
		return {
			area: Area.copy(delegation.area),
			userPublicKey: UserPublicKey.copy(delegation.userPublicKey),
			userSignature: UserSignature.copy(delegation.userSignature),
		};
	}

	public static getFinalDelegation(
		capability: CommunalCapability | OwnedCapability,
	): Delegation | undefined {
		return capability.delegations[capability.delegations.length - 1];
	}

	public static getLongestCommonPrefixLength(
		a: CommunalCapability | OwnedCapability,
		b: CommunalCapability | OwnedCapability,
	) {
		const maxDelegations = Math.min(a.delegations.length, b.delegations.length);
		for (let i = 0; i < maxDelegations; i++) {
			if (!Delegation.equals(a.delegations[i], b.delegations[i])) {
				return i;
			}
		}
		return maxDelegations;
	}

	public static encodeDelegationSubspaceIdRelative(val: Delegation, rel: SubspaceId): ByteString {
		return ByteString.concat(
			Area.encodeAreaInArea(val.area, Area.ofSubspace(rel)),
			UserPublicKey.encode(val.userPublicKey),
			UserSignature.encode(val.userSignature),
		);
	}

	public static decodeDelegationSubspaceIdRelative(
		input: ByteString,
		rel: SubspaceId,
	): {
		delegation: Delegation;
		consumedBytes: number;
	} {
		let consumedBytes = 0;
		const { area, consumedBytes: areaConsumedBytes } = Area.decodeAreaInArea(
			input,
			Area.ofSubspace(rel),
		);
		consumedBytes += areaConsumedBytes;

		const { userPublicKey, consumedBytes: userPublicKeyConsumedBytes } = UserPublicKey.decode(
			input.slice(consumedBytes),
		);
		consumedBytes += userPublicKeyConsumedBytes;

		const { userSignature, consumedBytes: userSignatureConsumedBytes } = UserSignature.decode(
			input.slice(consumedBytes),
		);
		consumedBytes += userSignatureConsumedBytes;

		return {
			delegation: {
				area,
				userPublicKey,
				userSignature,
			},
			consumedBytes,
		};
	}

	public constructor(
		public area: Area,
		public userPublicKey: UserPublicKey,
		public userSignature: UserSignature,
	) {}
}

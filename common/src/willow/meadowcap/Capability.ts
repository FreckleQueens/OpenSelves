import { Area } from "../Area.js";
import type { ByteProvider } from "../ByteProvider.js";
import { ByteString } from "../ByteString.js";
import { NamespaceId } from "../NamespaceId.js";
import { SubspaceId } from "../SubspaceId.js";
import { UInt64 } from "../UInt64.js";
import { Willow25 } from "../Willow25.js";
import type { CapabilitySignData } from "./CapabilitySignData.js";
import { CommunalCapability } from "./CommunalCapability.js";
import { Delegation } from "./Delegation.js";
import { NamespacePublicKey } from "./NamespacePublicKey.js";
import { OwnedCapability } from "./OwnedCapability.js";
import { UserPublicKey } from "./UserPublicKey.js";

export enum CapabilityAccessMode {
	READ,
	WRITE,
}

/**
 * https://willowprotocol.org/specs/meadowcap/index.html#Capability
 */
export class Capability {
	public static is(value: unknown): value is Capability {
		return !!(
			value &&
			typeof value === "object" &&
			"inner" in value &&
			(CommunalCapability.is(value.inner) || OwnedCapability.is(value.inner))
		);
	}

	public static async isValid(capability: Capability): Promise<boolean> {
		if (NamespaceId.isCommunal(capability.inner.namespaceKey)) {
			return CommunalCapability.isValid(capability.inner);
		} else {
			throw new Error("Checking for OwnedCapability validity is not implemented");
		}
	}

	public static copy(capability: Capability): Capability {
		if (NamespaceId.isCommunal(capability.inner.namespaceKey)) {
			return {
				inner: CommunalCapability.copy(capability.inner),
			};
		} else {
			throw new Error("Copying OwnedCapability is not implemented");
		}
	}

	public static default(): Capability {
		return {
			inner: {
				accessMode: CapabilityAccessMode.WRITE,
				namespaceKey: Willow25.DEFAULT_NAMESPACE_ID,
				userKey: Willow25.DEFAULT_SUBSPACE_ID,
				delegations: [],
			},
		};
	}

	public static create(
		accessMode: CapabilityAccessMode,
		namespaceKey: NamespacePublicKey,
		userKey: UserPublicKey,
		delegations: Delegation[],
	): Capability {
		let capability: CommunalCapability | OwnedCapability;
		if (NamespaceId.isCommunal(namespaceKey)) {
			capability = {
				accessMode,
				namespaceKey,
				userKey,
				delegations,
			};
		} else {
			throw new Error("Creating OwnedCapability is not implemented");
		}
		return {
			inner: capability,
		};
	}

	public static getGrantedArea(capability: Capability): Area {
		if (NamespaceId.isCommunal(capability.inner.namespaceKey)) {
			return CommunalCapability.getGrantedArea(capability.inner);
		} else {
			throw new Error("Getting granted area for OwnedCapability is not implemented");
		}
	}

	public static getReceiver(capability: Capability): UserPublicKey {
		if (NamespaceId.isCommunal(capability.inner.namespaceKey)) {
			return CommunalCapability.getReceiver(capability.inner);
		} else {
			throw new Error("Getting receiver for OwnedCapability is not implemented");
		}
	}

	public static getGrantedNamespace(capability: Capability): NamespaceId {
		return capability.inner.namespaceKey;
	}

	public static getGrantedSubspace(capability: Capability): SubspaceId | undefined {
		return this.getGrantedArea(capability).subspaceId;
	}

	public static async delegateCapability(
		accessMode: CapabilityAccessMode,
		namespaceKey: NamespacePublicKey,
		userKey: UserPublicKey,
		signData: CapabilitySignData,
		newReceiver: UserPublicKey = userKey,
		newArea: Area = Area.ofSubspace(userKey),
		ignoreInvalidResult: boolean = false,
	): Promise<Capability> {
		if (NamespaceId.isCommunal(namespaceKey)) {
			const previousCap: Capability = {
				inner: {
					accessMode,
					namespaceKey,
					userKey,
					delegations: signData.delegations || [],
				},
			};
			return {
				inner: await CommunalCapability.delegate(
					previousCap.inner,
					newArea,
					newReceiver,
					signData.secretKey,
					ignoreInvalidResult,
				),
			};
		} else {
			throw new Error("Getting receiver for OwnedCapability is not implemented");
		}
	}

	public static encode(val: Capability): ByteString {
		const isCommunal = NamespaceId.isCommunal(val.inner.namespaceKey);
		if (!isCommunal) {
			throw new Error("Encoding owned capabilities is not supported");
		}

		let accessModeByte = 0b0000_0000;
		if (val.inner.accessMode === CapabilityAccessMode.WRITE) {
			accessModeByte |= 0b0000_0001;
		}
		if (!isCommunal) {
			accessModeByte |= 0b0000_0010;
		}

		const parts: ByteString[] = [
			ByteString.of(accessModeByte),
			NamespacePublicKey.encode(val.inner.namespaceKey),
			UserPublicKey.encode(val.inner.userKey),
			UInt64.encodeToVariable8(BigInt(val.inner.delegations.length)),
		];

		for (const delegation of val.inner.delegations) {
			parts.push(
				Delegation.encodeDelegationSubspaceIdRelative(delegation, val.inner.userKey),
			);
		}

		return ByteString.concat(...parts);
	}

	public static async decode(provider: ByteProvider): Promise<Capability> {
		const accessModeByte = (await provider.read(1))[0];

		const isCommunal = (accessModeByte & 0b0000_0010) === 0;
		const isRead = (accessModeByte & 0b0000_0001) === 0;
		if (!isCommunal) {
			throw new Error("Decoding owned capabilities is not supported");
		}

		const namespacePublicKey = await NamespacePublicKey.decode(provider);
		const userPublicKey = await UserPublicKey.decode(provider);
		const delegationsLength = await UInt64.decodeVariable8(provider);

		const delegations: Delegation[] = [];
		for (let i = 0; i < delegationsLength.valueOf(); i++) {
			delegations.push(
				await Delegation.decodeDelegationSubspaceIdRelative(userPublicKey, provider),
			);
		}

		return {
			inner: {
				namespaceKey: namespacePublicKey,
				userKey: userPublicKey,
				accessMode: isRead ? CapabilityAccessMode.READ : CapabilityAccessMode.WRITE,
				delegations,
			},
		};
	}

	public constructor(public inner: CommunalCapability | OwnedCapability) {}
}

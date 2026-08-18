import { Area } from "../Area.js";
import { type ByteProvider, InvalidInputError } from "../ByteProvider.js";
import { ByteString } from "../ByteString.js";
import { NamespaceId } from "../NamespaceId.js";
import { UInt64 } from "../UInt64.js";
import { Willow25 } from "../Willow25.js";
import type { CapabilitySignData } from "./CapabilitySignData.js";
import { CommunalCapability } from "./CommunalCapability.js";
import { Delegation } from "./Delegation.js";
import { NamespacePublicKey } from "./NamespacePublicKey.js";
import { NamespaceSignature } from "./NamespaceSignature.js";
import { OwnedCapability } from "./OwnedCapability.js";
import { UserPublicKey } from "./UserPublicKey.js";
import { UserSignature } from "./UserSignature.js";

export enum CapabilityAccessMode {
	READ,
	WRITE,
}

/**
 * https://willowprotocol.org/specs/meadowcap/index.html#Capability
 */
export class Capability {
	public static is(val: unknown): val is Capability {
		return !!(
			val &&
			typeof val === "object" &&
			"inner" in val &&
			(CommunalCapability.is(val.inner) || OwnedCapability.is(val.inner))
		);
	}

	public static isCommunal(val: Capability["inner"]): boolean {
		return NamespaceId.isCommunal(val.namespaceKey);
	}

	public static async isValid(val: Capability | Capability["inner"]): Promise<boolean> {
		if ("inner" in val) {
			return this.isValid(val.inner);
		}

		if (this.isCommunal(val)) {
			return CommunalCapability.isValid(val);
		} else {
			return OwnedCapability.is(val) && (await OwnedCapability.isValid(val));
		}
	}

	public static isOwned(val: Capability["inner"]): boolean {
		return !this.isCommunal(val);
	}

	public static copy(val: Capability): Capability {
		if (this.isCommunal(val.inner)) {
			return {
				inner: CommunalCapability.copy(val.inner),
			};
		} else {
			if (!OwnedCapability.is(val.inner)) {
				throw new Error("val.inner is not an OwnedCapability", { cause: val });
			}

			return {
				inner: OwnedCapability.copy(val.inner),
			};
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
		let capability: Capability["inner"];
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

	public static getGrantedArea(val: Capability | Capability["inner"]): Area {
		if ("inner" in val) {
			return this.getGrantedArea(val.inner);
		}

		const finalDelegation = this.getFinalDelegation(val);
		if (finalDelegation) {
			return finalDelegation.area;
		} else {
			return this.isCommunal(val) ? Area.ofSubspace(val.userKey) : Area.full();
		}
	}

	public static getReceiver(val: Capability | Capability["inner"]): UserPublicKey {
		if ("inner" in val) {
			return this.getReceiver(val.inner);
		}

		const finalDelegation = this.getFinalDelegation(val);
		return finalDelegation ? finalDelegation.userPublicKey : val.userKey;
	}

	public static getGrantedNamespace(val: Capability | Capability["inner"]): NamespaceId {
		if ("inner" in val) {
			return this.getGrantedNamespace(val.inner);
		}

		return val.namespaceKey;
	}

	public static getFinalDelegation(val: Capability["inner"]): Delegation | undefined {
		return val.delegations[val.delegations.length - 1];
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
			throw new Error("Delegating OwnedCapability is not implemented");
		}
	}

	/**
	 * https://willowprotocol.org/specs/encodings/index.html#encsec_McCapability
	 * https://willowprotocol.org/specs/encodings/index.html#encsec_EncodeCommunalCapability
	 * https://willowprotocol.org/specs/encodings/index.html#encsec_EncodeOwnedCapability
	 */
	public static encode(val: Capability): ByteString {
		const inner = val.inner;
		const isOwned = OwnedCapability.is(inner);

		let headerByte = 0b0000_0000;
		if (isOwned) {
			headerByte |= 0b1000_0000;
		}
		if (inner.accessMode === CapabilityAccessMode.WRITE) {
			headerByte |= 0b0100_0000;
		}

		const delegationsLength = UInt64.encodeVariable(
			BigInt(inner.delegations.length),
			headerByte,
			6,
			2,
		);
		headerByte = delegationsLength.headerByte;

		const parts: ByteString[] = [
			ByteString.of(headerByte),
			NamespacePublicKey.encode(inner.namespaceKey),
			UserPublicKey.encode(inner.userKey),
		];

		if (isOwned) {
			parts.push(NamespaceSignature.encode(inner.initialAuthorisation));
		}

		parts.push(delegationsLength.additionalBytes);

		let previousArea = isOwned ? Area.full() : Area.ofSubspace(inner.userKey);
		for (const delegation of inner.delegations) {
			parts.push(
				Area.encodeAreaInArea(delegation.area, previousArea),
				UserPublicKey.encode(delegation.userPublicKey),
				UserSignature.encode(delegation.userSignature),
			);
			previousArea = delegation.area;
		}

		return ByteString.concat(...parts);
	}

	public static async decode(provider: ByteProvider): Promise<Capability> {
		const headerByte = (await provider.read(1))[0];

		const isOwned = !!(headerByte & 0b1000_0000);
		const isWrite = !!(headerByte & 0b0100_0000);

		const namespacePublicKey = await NamespacePublicKey.decode(provider);

		if (!isOwned !== NamespaceId.isCommunal(namespacePublicKey)) {
			throw new InvalidInputError(
				"Invalid namespacePublicKey for " +
					(isOwned ? "owned" : "communal") +
					" capability",
				{
					cause: namespacePublicKey,
				},
			);
		}

		const userPublicKey = await UserPublicKey.decode(provider);

		let initialAuthorisation: NamespaceSignature | undefined;
		if (isOwned) {
			initialAuthorisation = await NamespaceSignature.decode(provider);
		}

		const delegationsLength = await UInt64.decodeVariable(headerByte, 6, 2, provider);

		const delegations: Delegation[] = [];
		let previousArea = isOwned ? Area.full() : Area.ofSubspace(userPublicKey);
		for (let i = 0; i < delegationsLength.valueOf(); i++) {
			const delegation = {
				area: await Area.decodeAreaInArea(previousArea, provider),
				userPublicKey: await UserPublicKey.decode(provider),
				userSignature: await UserSignature.decode(provider),
			};
			delegations.push(delegation);
			previousArea = delegation.area;
		}

		const result = {
			inner: {
				namespaceKey: namespacePublicKey,
				userKey: userPublicKey,
				accessMode: isWrite ? CapabilityAccessMode.WRITE : CapabilityAccessMode.READ,
				delegations,
			},
		};

		if (isOwned) {
			result.inner["initialAuthorisation"] = initialAuthorisation;
		}

		if (!(await Capability.isValid(result.inner))) {
			throw new InvalidInputError("Got invalid result", { cause: result });
		}

		return result;
	}

	public constructor(public inner: CommunalCapability | OwnedCapability) {}
}

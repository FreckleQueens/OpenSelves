import { Area } from "../Area.js";
import type { ByteProvider } from "../ByteProvider.js";
import { ByteString } from "../ByteString.js";
import { Ed25519, Ed25519Sk } from "../Ed25519.js";
import type { Entry } from "../Entry.js";
import { Path } from "../Path.js";
import { UInt64 } from "../UInt64.js";
import { PrivateAreaContext } from "../private/PrivateAreaContext.js";
import { PrivateInterest } from "../private/PrivateInterest.js";
import type { AuthorisedEntry } from "./AuthorisedEntry.js";
import { Capability, CapabilityAccessMode } from "./Capability.js";
import { Delegation } from "./Delegation.js";
import { NamespacePublicKey } from "./NamespacePublicKey.js";
import { OwnedCapability } from "./OwnedCapability.js";
import { UserPublicKey } from "./UserPublicKey.js";
import { UserSignature } from "./UserSignature.js";

/**
 * https://willowprotocol.org/specs/meadowcap/index.html#CommunalCapability
 */
export class CommunalCapability {
	public static is(value: unknown): value is CommunalCapability {
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
			"delegations" in value &&
			Array.isArray(value.delegations) &&
			value.delegations.every((val: unknown) => Delegation.is(val))
		);
	}

	public static isCommunalCapability(
		val: OwnedCapability | CommunalCapability,
	): val is CommunalCapability {
		return !OwnedCapability.isOwnedCapability(val);
	}

	public static async isValid(capability: Capability["inner"]): Promise<boolean> {
		const finalDelegation = Delegation.getFinalDelegation(capability);
		if (finalDelegation === undefined) {
			return true;
		}

		const previousCapability: CommunalCapability = {
			accessMode: capability.accessMode,
			namespaceKey: capability.namespaceKey,
			userKey: capability.userKey,
			delegations: capability.delegations.slice(0, capability.delegations.length - 1),
		};
		const previousArea = CommunalCapability.getGrantedArea(previousCapability);
		const previousReceiver = CommunalCapability.getReceiver(previousCapability);

		const newArea = CommunalCapability.getGrantedArea(capability);
		const newReceiver = CommunalCapability.getReceiver(capability);

		const handoverPayload: ByteString = CommunalCapability.getHandoverPayload(
			previousCapability,
			newArea,
			newReceiver,
		);

		return (
			Area.includes(previousArea, newArea) &&
			(await CommunalCapability.isValid(previousCapability)) &&
			(await Ed25519.verify(previousReceiver, finalDelegation.userSignature, handoverPayload))
		);
	}

	public static copy(capability: CommunalCapability): CommunalCapability {
		return {
			accessMode: capability.accessMode,
			namespaceKey: NamespacePublicKey.copy(capability.namespaceKey),
			userKey: UserPublicKey.copy(capability.userKey),
			delegations: capability.delegations.map((delegation) => Delegation.copy(delegation)),
		};
	}

	public static getGrantedArea(capability: CommunalCapability): Area {
		const finalDelegation = Delegation.getFinalDelegation(capability);
		if (finalDelegation) {
			return finalDelegation.area;
		} else {
			return {
				subspaceId: capability.userKey,
				path: Path.EMPTY,
				times: {
					start: 0n,
					end: undefined,
				},
			};
		}
	}

	public static getReceiver(capability: CommunalCapability): UserPublicKey {
		const finalDelegation = Delegation.getFinalDelegation(capability);
		return finalDelegation ? finalDelegation.userPublicKey : capability.userKey;
	}

	public static getHandoverPayload(
		previousCapability: CommunalCapability,
		newArea: Area,
		newReceiver: UserPublicKey,
	): ByteString {
		const previousDelegation = Delegation.getFinalDelegation(previousCapability);
		const previousArea = CommunalCapability.getGrantedArea(previousCapability);
		const relativeEncodedArea = Area.encodeAreaInArea(newArea, previousArea);
		const newUserEncodedPk = UserPublicKey.encode(newReceiver);
		if (previousDelegation === undefined) {
			const accessModeByte =
				previousCapability.accessMode === CapabilityAccessMode.WRITE
					? ByteString.of(0x01)
					: ByteString.of(0x00);
			const encodedNamespacePk = NamespacePublicKey.encode(previousCapability.namespaceKey);
			return ByteString.concat(
				accessModeByte,
				encodedNamespacePk,
				relativeEncodedArea,
				newUserEncodedPk,
			);
		} else {
			const encodedPreviousSignature = UserSignature.encode(previousDelegation.userSignature);
			return ByteString.concat(
				relativeEncodedArea,
				encodedPreviousSignature,
				newUserEncodedPk,
			);
		}
	}

	public static async delegate(
		val: CommunalCapability,
		newArea: Area,
		newReceiver: UserPublicKey,
		secretKey: Ed25519Sk,
		ignoreInvalidResult: boolean = false,
	): Promise<CommunalCapability> {
		if (!CommunalCapability.isCommunalCapability(val)) {
			throw new Error("val needs to be a communal capability, found an owned capability", {
				cause: val,
			});
		}

		const newCapability = CommunalCapability.copy(val);
		newCapability.delegations.push({
			area: newArea,
			userPublicKey: newReceiver,
			userSignature: await Ed25519.sign(
				secretKey,
				CommunalCapability.getHandoverPayload(val, newArea, newReceiver),
			),
		});

		if (!ignoreInvalidResult && !(await CommunalCapability.isValid(newCapability))) {
			throw new Error("resulting capability is invalid", {
				cause: newCapability,
			});
		}

		return newCapability;
	}

	/**
	 * https://willowprotocol.org/specs/encodings/index.html#encsec_EncodeCommunalCapabilityRelative
	 */
	public static encodeCommunalCapabilityRelative(
		val: CommunalCapability,
		rel: {
			authorisedEntry: AuthorisedEntry;
			entry: Entry;
		},
	): ByteString {
		if (val.accessMode !== CapabilityAccessMode.WRITE) {
			throw new Error("Cannot EncodeCommunalCapabilityRelative read access capability", {
				cause: val,
			});
		}

		if (!NamespacePublicKey.equals(val.namespaceKey, rel.entry.namespaceId)) {
			throw new Error("capability and entry have different namespaces", {
				cause: {
					val,
					rel,
				},
			});
		}

		if (!Area.includesEntry(CommunalCapability.getGrantedArea(val), rel.entry)) {
			throw new Error("entry isn't included in capability's granted area", {
				cause: {
					val,
					rel,
				},
			});
		}

		const relCap = rel.authorisedEntry.authorisationToken.capability.inner;
		const shared = OwnedCapability.isOwnedCapability(relCap)
			? 0n
			: BigInt(Delegation.getLongestCommonPrefixLength(val, relCap));
		const niceHack = OwnedCapability.isOwnedCapability(relCap) ? 0n : shared + 1n;

		const niceHackVariable = UInt64.encodeToVariable(niceHack, 3);
		const delegationLengthVariable = UInt64.encodeToVariable(BigInt(val.delegations.length), 4);

		const headerByte =
			0b0000_0000 | ((niceHackVariable.tag << 4) | delegationLengthVariable.tag);

		const parts: ByteString[] = [
			ByteString.of(headerByte),
			niceHackVariable.additionalBytes,
			delegationLengthVariable.additionalBytes,
		];

		const ctxPrivateInterest: PrivateInterest = {
			namespaceId: rel.entry.namespaceId,
			subspaceId: rel.entry.subspaceId,
			path: rel.entry.path,
		};
		for (let i = 0; i < val.delegations.length; i++) {
			const delegation = val.delegations[i];
			if (i >= shared) {
				const previousCtx: PrivateAreaContext = {
					privateInterest: ctxPrivateInterest,
					rel:
						i === 0
							? Area.ofSubspace(rel.entry.subspaceId)
							: val.delegations[i - 1].area,
				};
				parts.push(
					PrivateAreaContext.encodePrivateAreaAlmostInArea(delegation.area, previousCtx),
					UserPublicKey.encode(delegation.userPublicKey),
					UserSignature.encode(delegation.userSignature),
				);
			}
		}

		return ByteString.concat(...parts);
	}

	public static async decodeCommunalCapabilityRelative(
		rel: {
			authorisedEntry: AuthorisedEntry;
			entry: Omit<Entry, "payloadDigest">;
		},
		headerByte: number,
		provider: ByteProvider,
	): Promise<CommunalCapability> {
		if (headerByte >> 7 !== 0) {
			throw new Error("Invalid header first bit, must be 0", {
				cause: headerByte,
			});
		}

		const delegations: Delegation[] = [];

		const niceHack = await UInt64.decodeVariable(headerByte, 3, 1, provider);
		const delegationsLength = await UInt64.decodeVariable(headerByte, 4, 4, provider);

		const sharedLength = Number(niceHack) - 1;
		delegations.push(
			...rel.authorisedEntry.authorisationToken.capability.inner.delegations
				.slice(0, sharedLength)
				.map((delegation) => Delegation.copy(delegation)),
		);

		const ctxPrivateInterest: PrivateInterest = {
			namespaceId: rel.entry.namespaceId,
			subspaceId: rel.entry.subspaceId,
			path: rel.entry.path,
		};
		for (let i = 0; i < Number(delegationsLength) - sharedLength; i++) {
			const previousCtx: PrivateAreaContext = {
				privateInterest: ctxPrivateInterest,
				rel:
					delegations.length === 0
						? Area.ofSubspace(rel.entry.subspaceId)
						: delegations[delegations.length - 1].area,
			};

			const area = await PrivateAreaContext.decodePrivateAreaAlmostInArea(
				previousCtx,
				provider,
			);
			const userPublicKey = await UserPublicKey.decode(provider);
			const userSignature = await UserSignature.decode(provider);

			delegations.push({
				area,
				userPublicKey,
				userSignature,
			});
		}

		return {
			accessMode: CapabilityAccessMode.WRITE,
			namespaceKey: rel.entry.namespaceId,
			userKey: rel.entry.subspaceId,
			delegations,
		};
	}

	public static encodeCommunalCapabilityEntryRelative(
		val: CommunalCapability,
		rel: Entry,
	): ByteString {
		if (val.accessMode !== CapabilityAccessMode.WRITE) {
			throw new Error("Cannot EncodeCommunalCapabilityRelative read access capability", {
				cause: val,
			});
		}

		if (!NamespacePublicKey.equals(val.namespaceKey, rel.namespaceId)) {
			throw new Error("capability and entry have different namespaces", {
				cause: {
					val,
					rel,
				},
			});
		}

		if (!Area.includesEntry(CommunalCapability.getGrantedArea(val), rel)) {
			throw new Error("entry isn't included in capability's granted area", {
				cause: {
					val,
					rel,
				},
			});
		}

		const delegationsLength = val.delegations.length;

		const { headerByte, additionalBytes: headerAdditionalBytes } = UInt64.encodeVariable(
			BigInt(delegationsLength),
			0b0000_0000,
			7,
			1,
		);

		const parts: ByteString[] = [ByteString.of(headerByte), headerAdditionalBytes];

		for (const delegation of val.delegations) {
			parts.push(Delegation.encodeDelegationSubspaceIdRelative(delegation, rel.subspaceId));
		}

		return ByteString.concat(...parts);
	}

	public static async decodeCommunalCapabilityEntryRelative(
		rel: Entry,
		headerByte: number,
		provider: ByteProvider,
	): Promise<CommunalCapability> {
		if (headerByte >> 7 !== 0b0) {
			throw new Error("First bit of header byte must be 0 for a communal capability", {
				cause: headerByte.toString(2),
			});
		}

		const delegationsLength = await UInt64.decodeVariable(headerByte, 7, 1, provider);

		const delegations: Delegation[] = [];
		for (let i = 0; i < delegationsLength.valueOf(); i++) {
			delegations.push(
				await Delegation.decodeDelegationSubspaceIdRelative(rel.subspaceId, provider),
			);
		}

		return {
			accessMode: CapabilityAccessMode.WRITE,
			namespaceKey: rel.namespaceId,
			userKey: rel.subspaceId,
			delegations,
		};
	}

	public constructor(
		public accessMode: CapabilityAccessMode,
		public namespaceKey: NamespacePublicKey,
		public userKey: UserPublicKey,
		public delegations: Delegation[],
	) {}
}

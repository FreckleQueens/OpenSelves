import { Capability, type Delegation, Ed25519Sk } from "../index.js";

export class CapabilitySignData {
	public static fromCapability(
		secretKey: Ed25519Sk,
		cap: Capability | Capability["inner"],
	): CapabilitySignData {
		return {
			secretKey,
			delegations: Capability.is(cap) ? cap.inner.delegations : cap.delegations,
		};
	}

	public constructor(
		public readonly secretKey: Ed25519Sk,
		public readonly delegations?: Delegation[],
	) {}
}

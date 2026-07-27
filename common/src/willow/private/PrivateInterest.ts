import type { Area } from "../Area.js";
import type { NamespaceId } from "../NamespaceId.js";
import { Path } from "../Path.js";
import { SubspaceId } from "../SubspaceId.js";

/**
 * https://willowprotocol.org/specs/pio/index.html#PrivateInterest
 */
export class PrivateInterest {
	/**
	 * https://willowprotocol.org/specs/encodings/index.html#pi_amost_include
	 */
	public static almostIncludes(privateInterest: PrivateInterest, area: Area): boolean {
		return (
			Path.relates(privateInterest.path, area.path) &&
			(SubspaceId.equals(privateInterest.subspaceId, area.subspaceId) ||
				privateInterest.subspaceId === undefined ||
				area.subspaceId === undefined)
		);
	}

	public constructor(
		public readonly namespaceId: NamespaceId,
		public readonly subspaceId: SubspaceId | undefined,
		public readonly path: Path,
	) {}
}

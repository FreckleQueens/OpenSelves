import { Area } from "../Area.js";
import type { ByteProvider } from "../ByteProvider.js";
import { ByteString } from "../ByteString.js";
import { SubspaceId } from "../SubspaceId.js";
import { UInt64 } from "../UInt64.js";
import { PrivateInterest } from "./PrivateInterest.js";
import { PrivatePathContext } from "./PrivatePathContext.js";

/**
 * https://willowprotocol.org/specs/encodings/index.html#PrivateAreaContext
 */
export class PrivateAreaContext {
	/**
	 * https://willowprotocol.org/specs/encodings/index.html#enc_private_areas
	 */
	public static encodePrivateAreaAlmostInArea(val: Area, rel: PrivateAreaContext): ByteString {
		if (!Area.almostIncludes(rel.rel, val)) {
			throw new Error("rel.rel must almost include val", {
				cause: {
					val,
					rel,
				},
			});
		}

		if (!PrivateInterest.almostIncludes(rel.privateInterest, rel.rel)) {
			throw new Error("rel.privateInterest must almost include rel.rel", {
				cause: {
					val,
					rel,
				},
			});
		}

		const { startDiff, startFromStart, endDiff, endFromStart } =
			Area.getStartAndEndDiffsForRelativeEncoding(val, rel.rel);

		let headerByte = 0b0000_0000;
		const hasSubspaceId = !SubspaceId.equals(val.subspaceId, rel.rel.subspaceId);
		if (hasSubspaceId) {
			headerByte |= 0b1000_0000;
		}
		const isSubspaceIdAny = val.subspaceId === undefined;
		if (isSubspaceIdAny) {
			headerByte |= 0b0100_0000;
		}

		const {
			headerByte: headerByteTail,
			startDiffAdditionalBytes,
			endDiffAdditionalBytes,
		} = Area.encodeStartAndEndDiffToHeaderByte(
			startFromStart,
			endFromStart,
			startDiff,
			endDiff,
		);
		headerByte |= headerByteTail;

		const parts: ByteString[] = [ByteString.of(headerByte)];

		if (hasSubspaceId && !isSubspaceIdAny) {
			parts.push(SubspaceId.encode(val.subspaceId));
		}

		parts.push(startDiffAdditionalBytes);
		if (endDiffAdditionalBytes) {
			parts.push(endDiffAdditionalBytes);
		}

		parts.push(
			PrivatePathContext.encodePrivatePathExtendsPath(val.path, {
				privatePath: rel.privateInterest.path,
				rel: rel.rel.path,
			}),
		);

		return ByteString.concat(...parts);
	}

	public static async decodePrivateAreaAlmostInArea(
		rel: PrivateAreaContext,
		provider: ByteProvider,
	): Promise<Area> {
		const headerByte = (await provider.read(1))[0];
		const hasSubspaceId = !!(headerByte & 0b1000_0000);
		const isSubspaceIdOpen = !!(headerByte & 0b0100_0000);
		const startFromStart = !!(headerByte & 0b0010_0000);
		const endFromStart = !!(headerByte & 0b0001_0000);

		const isEndOpen = rel.rel.times.end !== undefined ? false : !endFromStart;

		let subspaceId: SubspaceId | undefined;
		if (hasSubspaceId) {
			if (isSubspaceIdOpen) {
				subspaceId = undefined;
			} else {
				subspaceId = await SubspaceId.decode(provider);
			}
		} else {
			subspaceId = rel.rel.subspaceId;
		}

		const startDiff = await UInt64.decodeVariable(headerByte, 2, 4, provider);
		let start: UInt64;
		if (startFromStart) {
			start = startDiff.valueOf() + rel.rel.times.start.valueOf();
		} else {
			if (rel.rel.times.end === undefined) {
				throw new Error("startFromStart is false but relEnd is undefined");
			}
			start = rel.rel.times.end.valueOf() - startDiff.valueOf();
		}

		let endDiff: UInt64 | undefined;
		if (!isEndOpen) {
			endDiff = await UInt64.decodeVariable(headerByte, 2, 6, provider);
		}

		let end: UInt64 | undefined;
		if (endDiff === undefined) {
			end = undefined;
		} else if (endFromStart) {
			end = endDiff.valueOf() + rel.rel.times.start.valueOf();
		} else {
			if (rel.rel.times.end === undefined) {
				throw new Error("endFromStart is false but relEnd is undefined");
			}
			end = rel.rel.times.end.valueOf() - endDiff.valueOf();
		}

		const path = await PrivatePathContext.decodePrivatePathExtendsPath(
			{
				privatePath: rel.privateInterest.path,
				rel: rel.rel.path,
			},
			provider,
		);

		return {
			subspaceId,
			path,
			times: { start, end },
		};
	}

	public constructor(
		public readonly privateInterest: PrivateInterest,
		public readonly rel: Area,
	) {}
}

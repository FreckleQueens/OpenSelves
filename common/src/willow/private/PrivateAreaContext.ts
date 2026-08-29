import { Area } from "../Area.js";
import { type ByteProvider, InvalidInputError } from "../ByteProvider.js";
import { ByteString } from "../ByteString.js";
import { SubspaceId } from "../SubspaceId.js";
import { UInt64 } from "../UInt64.js";
import { PrivateInterest } from "./PrivateInterest.js";
import { PrivatePathContext } from "./PrivatePathContext.js";

/**
 * https://willowprotocol.org/specs/encodings/index.html#PrivateAreaContext
 */
export class PrivateAreaContext {
	public static isValid(val: PrivateAreaContext): boolean {
		return PrivateInterest.isValid(val.privateInterest) && Area.isValid(val.rel);
	}

	/**
	 * https://willowprotocol.org/specs/encodings/index.html#enc_private_areas
	 */
	public static encodePrivateAreaAlmostInArea(val: Area, rel: PrivateAreaContext): ByteString {
		if (!Area.isValid(val)) {
			throw new Error("Invalid val", { cause: val });
		}
		if (!this.isValid(rel)) {
			throw new Error("Invalid rel", { cause: rel });
		}

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

	// TODO: refactor TimeRange encoding and decoding (same in EncodeAreaInArea)
	public static async decodePrivateAreaAlmostInArea(
		rel: PrivateAreaContext,
		provider: ByteProvider,
	): Promise<Area> {
		if (!this.isValid(rel)) {
			throw new Error("Invalid rel", { cause: rel });
		}

		if (!PrivateInterest.almostIncludes(rel.privateInterest, rel.rel)) {
			throw new Error("rel.privateInterest must almost include rel.rel", {
				cause: {
					rel,
				},
			});
		}

		const headerByte = (await provider.read(1))[0];
		const hasSubspaceId = !!(headerByte & 0b1000_0000);
		const isSubspaceIdOpen = !!(headerByte & 0b0100_0000);
		const startFromStart = !!(headerByte & 0b0010_0000);
		const endFromStart = !!(headerByte & 0b0001_0000);

		const isEndOpen = rel.rel.times.end !== undefined ? false : !endFromStart;

		// SubspaceId
		let subspaceId: SubspaceId | undefined;
		if (isSubspaceIdOpen) {
			subspaceId = undefined;
		} else if (hasSubspaceId) {
			subspaceId = await SubspaceId.decode(provider);
		} else {
			subspaceId = rel.rel.subspaceId;
		}

		// Start
		const startDiff = await UInt64.decodeVariable(headerByte, 2, 4, provider, false);
		let start: UInt64;
		if (startFromStart) {
			start = startDiff.valueOf() + rel.rel.times.start.valueOf();
		} else {
			if (rel.rel.times.end === undefined) {
				throw new InvalidInputError("startFromStart is false but relEnd is undefined");
			}
			start = rel.rel.times.end.valueOf() - startDiff.valueOf();
		}

		if (!UInt64.isValid(start)) {
			throw new InvalidInputError("Got invalid start", {
				cause: {
					start,
					startFromStart,
					startDiff,
					relRelTimes: rel.rel.times,
				},
			});
		}

		// End
		let end: UInt64 | undefined;
		if (isEndOpen) {
			end = undefined;
		} else {
			const endDiff = await UInt64.decodeVariable(headerByte, 2, 6, provider, false);

			if (endFromStart) {
				end = endDiff.valueOf() + rel.rel.times.start.valueOf();
			} else {
				if (rel.rel.times.end === undefined) {
					throw new InvalidInputError("endFromStart is false but relEnd is undefined");
				}
				end = rel.rel.times.end.valueOf() - endDiff.valueOf();
			}

			if (!UInt64.isValid(end)) {
				throw new InvalidInputError("Got invalid end", {
					cause: {
						end,
						endFromStart,
						endDiff,
						relRelTimes: rel.rel.times,
					},
				});
			}
		}

		// Path
		const path = await PrivatePathContext.decodePrivatePathExtendsPath(
			{
				privatePath: rel.privateInterest.path,
				rel: rel.rel.path,
			},
			provider,
		);

		const result = {
			subspaceId,
			path,
			times: { start, end },
		};

		if (!Area.isValid(result)) {
			throw new InvalidInputError("Invalid result", { cause: result });
		}

		return result;
	}

	public constructor(
		public readonly privateInterest: PrivateInterest,
		public readonly rel: Area,
	) {}
}

import { Area } from "../Area.js";
import { ByteString } from "../ByteString.js";
import type { DropDecodeSingleStep, DropDecodeStep } from "../Drop.js";
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

	public static decodePrivateAreaAlmostInArea(
		rel: PrivateAreaContext,
		callback: (area: Area) => void,
	): DropDecodeStep[] {
		let hasSubspaceId: boolean;
		let subspaceId: SubspaceId | undefined;
		const subspaceIdDecodeStep: DropDecodeSingleStep = {
			name: "Decode subspaceId",
			consumedBytes: 0,
			decode(bytes) {
				if (hasSubspaceId) {
					if (bytes.length === 0) {
						subspaceId = undefined;
					} else {
						subspaceId = SubspaceId.decode(bytes).subspaceId;
					}
				} else {
					subspaceId = rel.rel.subspaceId;
				}
			},
		};

		let startFromStart: boolean;
		let start: UInt64;
		const startDiffDecodeStep = UInt64.decodeUint64VariableAdditionalBytesStep(
			"startDiff",
			(result) => {
				if (startFromStart) {
					start = result.valueOf() + rel.rel.times.start.valueOf();
				} else {
					if (rel.rel.times.end === undefined) {
						throw new Error("startFromStart is false but relEnd is undefined");
					}
					start = rel.rel.times.end.valueOf() - result.valueOf();
				}
			},
		);

		let endFromStart: boolean;
		let isEndOpen: boolean;
		let end: UInt64 | undefined;
		const endDiffDecodeStep = UInt64.decodeUint64VariableAdditionalBytesStep(
			"endDiff",
			(result) => {
				if (isEndOpen) {
					end = undefined;
				} else if (endFromStart) {
					end = result.valueOf() + rel.rel.times.start.valueOf();
				} else {
					if (rel.rel.times.end === undefined) {
						throw new Error("endFromStart is false but relEnd is undefined");
					}
					end = rel.rel.times.end.valueOf() - result.valueOf();
				}
			},
		);

		return [
			{
				name: "decode header byte",
				consumedBytes: 1,
				decode(bytes) {
					const headerByte = bytes[0];
					hasSubspaceId = !!(headerByte & 0b1000_0000);
					const isSubspaceIdOpen = !!(headerByte & 0b0100_0000);
					startFromStart = !!(headerByte & 0b0010_0000);
					endFromStart = !!(headerByte & 0b0001_0000);
					const startDiffTag = headerByte & 0b0000_1100;
					const endDiffTag = headerByte & 0b0000_0011;

					if (hasSubspaceId && !isSubspaceIdOpen) {
						subspaceIdDecodeStep.consumedBytes = SubspaceId.LENGTH;
					}

					UInt64.decodeUint64VariableTagSetup(startDiffTag, 2, startDiffDecodeStep);
					isEndOpen = rel.rel.times.end !== undefined ? false : !endFromStart;
					UInt64.decodeUint64VariableTagSetup(endDiffTag, 2, endDiffDecodeStep);
					if (isEndOpen) {
						endDiffDecodeStep.consumedBytes = 0;
					}
				},
			},
			subspaceIdDecodeStep,
			startDiffDecodeStep,
			endDiffDecodeStep,
			...PrivatePathContext.decodePrivatePathExtendsPath(
				{
					privatePath: rel.privateInterest.path,
					rel: rel.rel.path,
				},
				(result) => {
					callback({
						subspaceId,
						path: result,
						times: { start, end },
					});
				},
			),
		];
	}

	public constructor(
		public readonly privateInterest: PrivateInterest,
		public readonly rel: Area,
	) {}
}

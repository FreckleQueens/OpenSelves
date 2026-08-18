import type { ByteProvider } from "./ByteProvider.js";
import { ByteString } from "./ByteString.js";
import type { Entry } from "./Entry.js";
import { Path } from "./Path.js";
import { SubspaceId } from "./SubspaceId.js";
import { TimeRange } from "./TimeRange.js";
import type { Timestamp } from "./Timestamp.js";
import { UInt64 } from "./UInt64.js";

export class Area {
	public static is(value: unknown): value is Area {
		return !!(
			value &&
			typeof value === "object" &&
			"subspaceId" in value &&
			(value.subspaceId === undefined || SubspaceId.is(value.subspaceId)) &&
			"path" in value &&
			Path.is(value.path) &&
			"times" in value &&
			TimeRange.is(value.times)
		);
	}

	public static equals(a: Area, b: Area): boolean {
		return (
			SubspaceId.equals(a.subspaceId, b.subspaceId) &&
			Path.equals(a.path, b.path) &&
			a.times.start === b.times.start &&
			a.times.end === b.times.end
		);
	}

	public static includes(a: Area, b: Area) {
		return (
			(a.subspaceId === undefined || SubspaceId.equals(b.subspaceId, a.subspaceId)) &&
			Path.extends(b.path, a.path) &&
			b.times.start >= a.times.start &&
			(a.times.end === undefined || (b.times.end !== undefined && b.times.end <= a.times.end))
		);
	}

	public static almostIncludes(a: Area, b: Area) {
		return (
			(SubspaceId.equals(a.subspaceId, b.subspaceId) ||
				a.subspaceId === undefined ||
				b.subspaceId === undefined) &&
			Area.includes(new Area(b.subspaceId, a.path, a.times), b)
		);
	}

	public static includesEntry(area: Area, entry: Entry) {
		return (
			(area.subspaceId === undefined ||
				SubspaceId.equals(entry.subspaceId, area.subspaceId)) &&
			Path.extends(entry.path, area.path) &&
			entry.timestamp >= area.times.start &&
			(area.times.end === undefined || entry.timestamp < area.times.end)
		);
	}

	public static copy(area: Area) {
		return {
			subspaceId:
				area.subspaceId === undefined ? undefined : SubspaceId.copy(area.subspaceId),
			path: Path.copy(area.path),
			times: {
				start: area.times.start,
				end: area.times.end,
			},
		};
	}

	/**
	 * https://willowprotocol.org/specs/grouping-entries/index.html#subspace_area
	 */
	public static ofSubspace(subspaceId: SubspaceId): Area {
		return {
			subspaceId,
			path: Path.EMPTY,
			times: {
				start: 0n,
				end: undefined,
			},
		};
	}

	public static encodeAreaInArea(val: Area, rel: Area) {
		if (!Area.includes(rel, val)) {
			throw new Error("Cannot encode area val in area rel if rel doesn't include val", {
				cause: {
					val,
					rel,
				},
			});
		}

		const { startDiff, startFromStart, endDiff, endFromStart } =
			this.getStartAndEndDiffsForRelativeEncoding(val, rel);

		let headerByte = 0b0000_0000;
		const hasSubspaceId = !SubspaceId.equals(val.subspaceId, rel.subspaceId);
		if (hasSubspaceId) {
			headerByte |= 0b1000_0000;
		}
		if (val.times.end === undefined) {
			headerByte |= 0b0100_0000;
		}

		const {
			headerByte: headerByteTail,
			startDiffAdditionalBytes,
			endDiffAdditionalBytes,
		} = this.encodeStartAndEndDiffToHeaderByte(
			startFromStart,
			endFromStart,
			startDiff,
			endDiff,
		);
		headerByte |= headerByteTail;

		const parts: ByteString[] = [ByteString.of(headerByte)];

		if (hasSubspaceId && val.subspaceId) {
			parts.push(SubspaceId.encode(val.subspaceId));
		}

		parts.push(startDiffAdditionalBytes);
		if (endDiffAdditionalBytes) {
			parts.push(endDiffAdditionalBytes);
		}

		parts.push(Path.encodePathRelativePath(val.path, rel.path));
		return ByteString.concat(...parts);
	}

	public static async decodeAreaInArea(rel: Area, provider: ByteProvider): Promise<Area> {
		const headerByte = (await provider.read(1))[0];

		const hasSubspaceId = !!(headerByte & 0b1000_0000);
		const isEndOpen = !!(headerByte & 0b0100_0000);
		const startFromStart = !!(headerByte & 0b0010_0000);
		const endFromStart = !!(headerByte & 0b0001_0000);
		if (isEndOpen && !!(headerByte & 0b0000_0011)) {
			throw new Error("val.times.end is open but header's last two bits aren't both 0", {
				cause: headerByte.toString(2).padStart(8, "0"),
			});
		}

		const subspaceId: SubspaceId | undefined = hasSubspaceId
			? await SubspaceId.decode(provider)
			: rel.subspaceId;
		const startDiff = await UInt64.decodeVariable(headerByte, 2, 4, provider);

		let endDiff: UInt64 | undefined;
		if (!isEndOpen) {
			endDiff = await UInt64.decodeVariable(headerByte, 2, 6, provider);
		}
		const path = await Path.decodePathRelativePath(rel.path, provider);

		let start: Timestamp;
		if (startFromStart) {
			start = startDiff.valueOf() + rel.times.start.valueOf();
		} else {
			if (rel.times.end === undefined) {
				throw new Error("startFromStart is false but rel.times.end is open", {
					cause: rel,
				});
			}
			start = rel.times.end.valueOf() - startDiff.valueOf();
		}

		let end: Timestamp | undefined;
		if (isEndOpen || endDiff === undefined) {
			end = undefined;
		} else if (endFromStart) {
			end = endDiff.valueOf() + rel.times.start.valueOf();
		} else {
			if (rel.times.end === undefined) {
				throw new Error("endFromStart is false but rel.times.end is open", {
					cause: rel,
				});
			}
			end = rel.times.end.valueOf() - endDiff.valueOf();
		}

		return {
			subspaceId,
			path,
			times: {
				start,
				end,
			},
		};
	}

	public static getStartAndEndDiffsForRelativeEncoding(val: Area, rel: Area) {
		const valStart = val.times.start.valueOf();
		const valEnd = val.times.end?.valueOf();
		const relStart = rel.times.start.valueOf();
		const relEnd = rel.times.end?.valueOf();

		let startDiff: bigint;
		let startFromStart: boolean;
		let endDiff: bigint | undefined;
		let endFromStart: boolean;

		if (relEnd === undefined) {
			[startDiff, startFromStart] = [valStart - relStart, true];

			if (valEnd === undefined) {
				[endDiff, endFromStart] = [undefined, false];
			} else {
				[endDiff, endFromStart] = [valEnd - relStart, true];
			}
		} else {
			if (valStart - relStart < relEnd - valStart) {
				[startDiff, startFromStart] = [valStart - relStart, true];
			} else {
				[startDiff, startFromStart] = [relEnd - valStart, false];
			}

			if (valEnd === undefined) {
				throw new Error("rel includes val, but valEnd is undefined");
			}

			if (valEnd - relStart < relEnd - valEnd) {
				[endDiff, endFromStart] = [valEnd - relStart, true];
			} else {
				[endDiff, endFromStart] = [relEnd - valEnd, false];
			}
		}
		return { startDiff, startFromStart, endDiff, endFromStart };
	}

	public static encodeStartAndEndDiffToHeaderByte(
		startFromStart: boolean,
		endFromStart: boolean,
		startDiff: bigint,
		endDiff: bigint | undefined,
	) {
		let headerByte = 0b0000_0000;
		if (startFromStart) {
			headerByte |= 0b0010_0000;
		}
		if (endFromStart) {
			headerByte |= 0b0001_0000;
		}

		const { headerByte: startDiffHeaderByte, additionalBytes: startDiffAdditionalBytes } =
			UInt64.encodeVariable(startDiff, headerByte, 2, 4);
		headerByte = startDiffHeaderByte;

		let endDiffAdditionalBytes: ByteString | undefined;
		if (endDiff !== undefined) {
			const { headerByte: endDiffHeaderByte, additionalBytes } = UInt64.encodeVariable(
				endDiff,
				headerByte,
				2,
				6,
			);
			endDiffAdditionalBytes = additionalBytes;
			headerByte = endDiffHeaderByte;
		}

		return {
			headerByte,
			startDiffAdditionalBytes,
			endDiffAdditionalBytes,
		};
	}

	public constructor(
		public readonly subspaceId: SubspaceId | undefined,
		public readonly path: Path,
		public readonly times: TimeRange,
	) {}
}

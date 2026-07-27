import { ByteString } from "../ByteString.js";
import type { DropDecodeMultiStep, DropDecodeStep } from "../Drop.js";
import { Path } from "../Path.js";
import { UInt64 } from "../UInt64.js";

export class PrivatePathContext {
	/**
	 * https://willowprotocol.org/specs/encodings/index.html#enc_private_paths
	 */
	public static encodePrivatePathExtendsPath(val: Path, rel: PrivatePathContext): ByteString {
		if (!Path.extends(val, rel.rel)) {
			throw new Error("rel.rel must be a prefix of val", {
				cause: {
					val,
					rel,
				},
			});
		}

		if (!Path.relates(rel.privatePath, val)) {
			throw new Error("rel.privatePath and val must be related", {
				cause: {
					val,
					rel,
				},
			});
		}

		const relCount = rel.rel.length;
		const privateCount = rel.privatePath.length;

		if (privateCount <= relCount) {
			return Path.encodePathExtendsPath(val, rel.rel);
		} else {
			const lcpLength = Path.getLongestCommonPrefixLength(val, rel.privatePath);
			return ByteString.concat(
				UInt64.encodeToVariable8(lcpLength),
				lcpLength.valueOf() >= privateCount
					? Path.encodePathExtendsPath(val, rel.privatePath)
					: ByteString.empty(),
			);
		}
	}

	public static decodePrivatePathExtendsPath(
		rel: PrivatePathContext,
		callback: (result: Path) => void,
	): DropDecodeStep[] {
		const relCount = rel.rel.length;
		const privateCount = rel.privatePath.length;

		if (privateCount <= relCount) {
			return Path.decodePath(callback);
		} else {
			const decodePathStep: DropDecodeMultiStep = {
				name: "decode path step",
				steps: [],
			};
			return [
				...UInt64.decodeUint64Variable8((result) => {
					if (result.valueOf() < rel.rel.length) {
						throw new Error("Got lcp smaller than rel.rel", {
							cause: {
								result,
								rel,
							},
						});
					}

					if (result.valueOf() >= privateCount) {
						decodePathStep.steps = Path.decodePathExtendsPath(
							rel.privatePath,
							callback,
						);
					} else {
						callback(rel.privatePath.slice(0, Number(result)));
					}
				}),
				decodePathStep,
			];
		}
	}

	public constructor(
		public readonly privatePath: Path,
		public readonly rel: Path,
	) {}
}

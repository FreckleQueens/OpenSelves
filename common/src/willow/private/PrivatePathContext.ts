import { type ByteProvider, InvalidInputError } from "../ByteProvider.js";
import { ByteString } from "../ByteString.js";
import { Path } from "../Path.js";
import { UInt64 } from "../UInt64.js";

export class PrivatePathContext {
	public static isValid(val: PrivatePathContext): boolean {
		return Path.isValid(val.privatePath) && Path.isValid(val.rel);
	}

	/**
	 * https://willowprotocol.org/specs/encodings/index.html#enc_private_paths
	 */
	public static encodePrivatePathExtendsPath(val: Path, rel: PrivatePathContext): ByteString {
		if (!Path.isValid(val)) {
			throw new Error("Got invalid val", { cause: val });
		}
		if (!PrivatePathContext.isValid(rel)) {
			throw new Error("Got invalid rel", { cause: rel });
		}

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

	public static async decodePrivatePathExtendsPath(
		rel: PrivatePathContext,
		provider: ByteProvider,
	): Promise<Path> {
		if (!PrivatePathContext.isValid(rel)) {
			throw new Error("Got invalid rel", { cause: rel });
		}

		const relCount = rel.rel.length;
		const privateCount = rel.privatePath.length;

		let result: Path;
		if (privateCount <= relCount) {
			result = await Path.decodePathExtendsPath(rel.rel, provider, false);
		} else {
			const lcpLength = (await UInt64.decodeVariable8(provider, false)).valueOf();
			if (lcpLength < rel.rel.length) {
				throw new InvalidInputError("Got lcpLength smaller than rel.rel", {
					cause: {
						lcpLength,
						rel,
					},
				});
			}

			if (lcpLength >= privateCount) {
				result = await Path.decodePathExtendsPath(rel.privatePath, provider, false);
			} else {
				if (lcpLength > rel.privatePath.length) {
					throw new InvalidInputError("Got lcpLength bigger than rel.privatePath", {
						cause: {
							lcpLength,
							relPrivatePath: rel.privatePath,
						},
					});
				}
				result = rel.privatePath.slice(0, Number(lcpLength));
			}
		}

		if (!Path.isValid(result)) {
			throw new Error("Got invalid result", { cause: result });
		}

		return result;
	}

	public constructor(
		public readonly privatePath: Path,
		public readonly rel: Path,
	) {}
}

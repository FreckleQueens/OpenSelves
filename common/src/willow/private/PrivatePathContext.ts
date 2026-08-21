import type { ByteProvider } from "../ByteProvider.js";
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
		canonic: boolean,
	): Promise<Path> {
		const relCount = rel.rel.length;
		const privateCount = rel.privatePath.length;

		let result: Path;
		if (privateCount <= relCount) {
			result = await Path.decode(provider, canonic);
		} else {
			const lcp = await UInt64.decodeVariable8(provider, canonic);
			if (lcp.valueOf() < rel.rel.length) {
				throw new Error("Got lcp smaller than rel.rel", {
					cause: {
						lcp,
						rel,
					},
				});
			}

			if (lcp.valueOf() >= privateCount) {
				result = await Path.decodePathExtendsPath(rel.privatePath, provider, canonic);
			} else {
				result = rel.privatePath.slice(0, Number(lcp));
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

import type { ByteProvider } from "../ByteProvider.js";
import { ByteString } from "../ByteString.js";
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

	public static async decodePrivatePathExtendsPath(
		rel: PrivatePathContext,
		provider: ByteProvider,
	): Promise<Path> {
		const relCount = rel.rel.length;
		const privateCount = rel.privatePath.length;

		if (privateCount <= relCount) {
			return await Path.decode(provider);
		} else {
			const lcp = await UInt64.decodeVariable8(provider);
			if (lcp.valueOf() < rel.rel.length) {
				throw new Error("Got lcp smaller than rel.rel", {
					cause: {
						lcp,
						rel,
					},
				});
			}

			if (lcp.valueOf() >= privateCount) {
				return Path.decodePathExtendsPath(rel.privatePath, provider);
			} else {
				return rel.privatePath.slice(0, Number(lcp));
			}
		}
	}

	public constructor(
		public readonly privatePath: Path,
		public readonly rel: Path,
	) {}
}

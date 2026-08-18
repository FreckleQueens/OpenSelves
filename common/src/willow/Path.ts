import { type ByteProvider } from "./ByteProvider.js";
import { ByteString } from "./ByteString.js";
import { PathComponent } from "./PathComponent.js";
import { UInt64 } from "./UInt64.js";
import { Willow25 } from "./Willow25.js";

export class Path extends Array<PathComponent> {
	public static readonly EMPTY: Path = <const>[];

	public static fromString(input: string): Path {
		if (input.length > 0 && !input.startsWith("/")) {
			throw new Error("Non-empty path string must start with /");
		}

		const stringComponents = input.substring(1).split("/");
		return this.fromStrings(...stringComponents);
	}

	public static toString(path: Path): string {
		return path.map((component) => `/${PathComponent.toString(component)}`).join("");
	}

	public static fromStrings(...components: string[]) {
		return components.map((component) => PathComponent.fromString(component));
	}

	public static is(value: unknown): value is Path {
		return Array.isArray(value) && value.every((component) => PathComponent.is(component));
	}

	public static isValid(path: Path): boolean {
		return (
			path.length <= Willow25.MAX_COMPONENT_COUNT &&
			path.every((component) => component.length <= Willow25.MAX_COMPONENT_LENGTH) &&
			path.reduce((previousValue, currentValue) => previousValue + currentValue.length, 0) <=
				Willow25.MAX_PATH_LENGTH
		);
	}

	public static equals(a: Path, b: Path) {
		return (
			a.length === b.length &&
			a.every((component, index) => PathComponent.equals(component, b[index]))
		);
	}

	public static extends(path: Path, prefix: Path) {
		return path.length >= prefix.length && Path.equals(path.slice(0, prefix.length), prefix);
	}

	public static endsWith(path: Path, suffix: Path) {
		return (
			path.length >= suffix.length &&
			Path.equals(path.slice(path.length - suffix.length, path.length), suffix)
		);
	}

	public static relates(a: Path, b: Path) {
		return Path.extends(a, b) || Path.extends(b, a);
	}

	public static copy(path: Path): Path {
		return path.map((component) => PathComponent.copy(component));
	}

	public static getLongestCommonPrefixLength(a: Path, b: Path): UInt64 {
		let prefixCount: bigint = 0n;
		while (
			prefixCount < a.length &&
			prefixCount < b.length &&
			PathComponent.equals(a[Number(prefixCount)], b[Number(prefixCount)])
		) {
			prefixCount++;
		}
		return prefixCount;
	}

	public static getLongestCommonPrefix(a: Path, b: Path): Path {
		const prefixCount = Path.getLongestCommonPrefixLength(a, b);
		return Path.copy(a.slice(0, Number(prefixCount)));
	}

	public static difference(from: Path, to: Path): Path {
		if (!Path.extends(to, from)) {
			throw new Error(
				"Difference is only possible from a path A to a path B where B is a prefix of A",
			);
		}

		const lcpLength = Path.getLongestCommonPrefixLength(from, to);
		return to.slice(Number(lcpLength), to.length);
	}

	/**
	 * Adds 1 to the path without changing its length. If all values are 0xff or if length is 0,
	 * returns undefined.
	 */
	public static getNextPrefix(prefix: Path): Path | undefined {
		const output = Path.copy(prefix);
		for (let compI = 0; compI < prefix.length; compI++) {
			const comp = output[prefix.length - 1 - compI];
			for (let i = 0; i < comp.length; i++) {
				const val = ++comp[comp.length - 1 - i];
				if (val === 0) {
					continue;
				}
				return output;
			}
		}

		return undefined;
	}

	/**
	 * https://willowprotocol.org/specs/encodings/index.html#encsec_EncodePath
	 */
	public static encode(path: Path): ByteString {
		const componentLengthSum = UInt64.encodeToVariable(
			path.reduce(
				(previousValue, currentValue) => previousValue + BigInt(currentValue.byteLength),
				0n,
			),
			4,
		);
		const componentCount = UInt64.encodeToVariable(BigInt(path.length), 4);

		const header = (componentLengthSum.tag << 4) | componentCount.tag;

		const parts: ByteString[] = [];
		parts.push(new Uint8Array([header]));
		parts.push(componentLengthSum.additionalBytes);
		parts.push(componentCount.additionalBytes);

		for (const component of path.slice(0, path.length - 1)) {
			parts.push(UInt64.encodeToVariable8(BigInt(component.byteLength)));
			parts.push(component);
		}

		if (path.length > 0) {
			parts.push(path[path.length - 1]);
		}

		return ByteString.concat(...parts);
	}

	public static async decode(provider: ByteProvider): Promise<Path> {
		const headerByte = (await provider.read(1))[0];

		const componentLengthSum = await UInt64.decodeVariable(headerByte, 4, 0, provider);
		const componentCount = await UInt64.decodeVariable(headerByte, 4, 4, provider);

		const path: Path = [];
		for (let i = 0; i < componentCount.valueOf() - 1n; i++) {
			const componentLength = await UInt64.decodeVariable8(provider);
			path.push(await provider.read(Number(componentLength)));
		}

		if (componentCount.valueOf() > 0) {
			const lastComponentLength =
				Number(componentLengthSum) - path.reduce((prev, cur) => prev + cur.length, 0);
			path.push(await provider.read(lastComponentLength));
		}

		return path;
	}

	/**
	 * https://willowprotocol.org/specs/encodings/index.html#encsec_EncodePathRelativePath
	 */
	public static encodePathRelativePath(val: Path, rel: Path): ByteString {
		const lcp = Path.getLongestCommonPrefix(val, rel);

		const parts: ByteString[] = [];
		parts.push(UInt64.encodeToVariable8(BigInt(lcp.length)));

		const difference = Path.difference(lcp, val);
		parts.push(Path.encode(difference));
		return ByteString.concat(...parts);
	}

	public static async decodePathRelativePath(rel: Path, provider: ByteProvider): Promise<Path> {
		const pathLongestCommonPrefixLength = await UInt64.decodeVariable8(provider);
		return [
			...rel.slice(0, Number(pathLongestCommonPrefixLength)),
			...(await Path.decode(provider)),
		];
	}

	/**
	 * https://willowprotocol.org/specs/encodings/index.html#EncodePathExtendsPath
	 */
	public static encodePathExtendsPath(val: Path, rel: Path): ByteString {
		if (!Path.extends(val, rel)) {
			throw new Error(
				"Cannot encode path extends path relative to a path that it doesn't extend",
			);
		}

		return Path.encode(Path.difference(rel, val));
	}

	public static async decodePathExtendsPath(rel: Path, provider: ByteProvider): Promise<Path> {
		return [...rel, ...(await Path.decode(provider))];
	}
}

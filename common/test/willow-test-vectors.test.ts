import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";

import { Area } from "../src/willow/Area.js";
import { ByteProvider, InvalidInputError } from "../src/willow/ByteProvider.js";
import { ByteString } from "../src/willow/ByteString.js";
import { Entry } from "../src/willow/Entry.js";
import { Path } from "../src/willow/Path.js";
import { Capability } from "../src/willow/index.js";

type EncodingFunctionSuite = {
	name: string;
	isValid(value: unknown): Promise<boolean> | boolean;

	type: "encodingFunction";
	encode(val: unknown): Promise<ByteString> | ByteString;
	decode(provider: ByteProvider): Promise<unknown>;

	hasNoYay?: boolean;
};
type RelativeEncodingFunctionSuite = {
	name: string;
	isValid(value: unknown): Promise<boolean> | boolean;

	type: "relativeEncodingFunction";
	encode(val: unknown, rel: unknown): Promise<ByteString> | ByteString;
	decode(rel: unknown, provider: ByteProvider): Promise<unknown>;
	decodeSingle(provider: ByteProvider): Promise<unknown>;

	hasNoYay?: boolean;
};
type Suite = EncodingFunctionSuite | RelativeEncodingFunctionSuite;

describe("willow_test_vectors repository", () => {
	const suites: Suite[] = [
		{
			name: "encode_area_in_area",
			type: "relativeEncodingFunction",
			encode(val: Area, rel: Area): ByteString {
				return Area.encodeAreaInArea(val, rel);
			},
			async decode(rel: Area, provider: ByteProvider): Promise<Area> {
				return Area.decodeAreaInArea(rel, provider);
			},
			async decodeSingle(provider: ByteProvider): Promise<Area> {
				return Area.decode(provider);
			},
			isValid(value: unknown): boolean {
				return Area.is(value);
			},
		},
		{
			name: "encode_entry",
			type: "encodingFunction",
			encode(value: Entry): ByteString {
				return Entry.encode(value);
			},
			async decode(provider: ByteProvider): Promise<Entry> {
				return Entry.decode(provider);
			},
			async isValid(value: unknown): Promise<boolean> {
				return Entry.is(value) && (await Entry.isValid(value));
			},
		},
		{
			name: "encode_mc_capability_1",
			type: "encodingFunction",
			encode(value: Capability): ByteString {
				return Capability.encode(value);
			},
			async decode(provider: ByteProvider): Promise<Capability> {
				return Capability.decode(provider);
			},
			async isValid(value: unknown): Promise<boolean> {
				return Capability.is(value) && (await Capability.isValid(value));
			},
		},
		{
			name: "encode_mc_capability_2",
			type: "encodingFunction",
			hasNoYay: true,
			encode(value: Capability): ByteString {
				return Capability.encode(value);
			},
			async decode(provider: ByteProvider): Promise<Capability> {
				return Capability.decode(provider);
			},
			async isValid(value: unknown): Promise<boolean> {
				return Capability.is(value) && (await Capability.isValid(value));
			},
		},
		{
			name: "encode_path",
			type: "encodingFunction",
			encode(value: Path): ByteString {
				return Path.encode(value);
			},
			async decode(provider: ByteProvider): Promise<Path> {
				return Path.decode(provider);
			},
			isValid(value: unknown): boolean {
				return Path.is(value) && Path.isValid(value);
			},
		},
		{
			name: "path_extends_path",
			type: "relativeEncodingFunction",
			encode(val: Path, rel: Path): ByteString {
				return Path.encodePathExtendsPath(val, rel);
			},
			async decode(rel: Path, provider: ByteProvider): Promise<Path> {
				return Path.decodePathExtendsPath(rel, provider);
			},
			async decodeSingle(provider: ByteProvider): Promise<Path> {
				return Path.decode(provider);
			},
			isValid(value: unknown): boolean {
				return Path.is(value) && Path.isValid(value);
			},
		},
		{
			name: "path_rel_path",
			type: "relativeEncodingFunction",
			encode(val: Path, rel: Path): ByteString {
				return Path.encodePathRelativePath(val, rel);
			},
			async decode(rel: Path, provider: ByteProvider): Promise<Path> {
				return Path.decodePathRelativePath(rel, provider);
			},
			async decodeSingle(provider: ByteProvider): Promise<Path> {
				return Path.decode(provider);
			},
			isValid(value: unknown): boolean {
				return Path.is(value) && Path.isValid(value);
			},
		},
	];

	for (const suite of suites) {
		const rootDir = path.resolve(import.meta.dirname, "willow_test_vectors", suite.name);
		const yayDir = path.resolve(rootDir, "yay");
		const yayRelativeToDir = path.resolve(rootDir, "yay_relative_to");
		const nayDir = path.resolve(rootDir, "nay");
		const nayRelativeToDir = path.resolve(rootDir, "nay_relative_to");
		const nayReasonDir = path.resolve(rootDir, "nay_reason");
		const reencodedDir = path.resolve(rootDir, "reencoded");

		describe(suite.name, () => {
			describe("yay", () => {
				// Check yay dir existence:
				const yayDirExists = fs.existsSync(yayDir);
				assert.strictEqual(yayDirExists, !suite.hasNoYay);
				if (suite.hasNoYay) return;

				for (const file of fs.readdirSync(yayDir)) {
					test(file, async () => {
						const bytes = new Uint8Array(fs.readFileSync(path.resolve(yayDir, file)));
						const provider = ByteProvider.of(bytes);

						let value: unknown;
						let rel: unknown;
						if (suite.type === "encodingFunction") {
							value = await suite.decode(provider);
						} else if (suite.type === "relativeEncodingFunction") {
							const relProvider = ByteProvider.of(
								new Uint8Array(
									fs.readFileSync(path.resolve(yayRelativeToDir, file)),
								),
							);
							rel = await suite.decodeSingle(relProvider);
							relProvider.endRead();
							value = await suite.decode(rel, provider);
						}
						provider.endRead();

						assert(value);
						assert(await suite.isValid(value));

						let reencoded: unknown;
						let expectedBytes: ByteString | undefined;
						if (suite.type === "encodingFunction") {
							reencoded = await suite.encode(value);
							expectedBytes = bytes;
						} else if (suite.type === "relativeEncodingFunction") {
							reencoded = await suite.encode(value, rel);
							expectedBytes = new Uint8Array(
								fs.readFileSync(path.resolve(reencodedDir, file)),
							);
						}
						assert(ByteString.is(reencoded));
						assert(expectedBytes);
						assert.deepStrictEqual(
							[...reencoded.values()],
							[...expectedBytes.values()],
						);
						assert(ByteString.equals(reencoded, expectedBytes));
					});
				}
			});

			describe("nay", () => {
				for (const file of fs.readdirSync(nayDir)) {
					test(file, async () => {
						const bytes = new Uint8Array(fs.readFileSync(path.resolve(nayDir, file)));
						const provider = ByteProvider.of(bytes);

						let rel: unknown;
						if (suite.type === "relativeEncodingFunction") {
							const provider = ByteProvider.of(
								new Uint8Array(
									fs.readFileSync(path.resolve(nayRelativeToDir, file)),
								),
							);
							rel = await suite.decodeSingle(provider);
							provider.endRead();
						}

						const doDecode = async () => {
							let value: unknown;
							if (suite.type === "encodingFunction") {
								value = await suite.decode(provider);
							} else if (suite.type === "relativeEncodingFunction") {
								value = await suite.decode(rel, provider);
							}
							provider.endRead();

							console.error(path.resolve(nayDir, file), "rel", rel, "val", value);
						};

						let actualError: unknown;
						try {
							await doDecode();
						} catch (e) {
							actualError = e;
						}

						assert(actualError);
						assert(typeof actualError === "object");

						const expectedErrorRaw = ByteString.toUtf8(
							new Uint8Array(fs.readFileSync(path.resolve(nayReasonDir, file))),
						);
						if (
							expectedErrorRaw.startsWith("UnexpectedEndOfInput") ||
							expectedErrorRaw === "Other(\n    TheirFault,\n)"
						) {
							if (!(actualError instanceof InvalidInputError)) {
								throw new Error("Expected InvalidInputError", {
									cause: actualError,
								});
							}
						} else {
							throw new Error("Unsupported expected nay_reason", {
								cause: expectedErrorRaw,
							});
						}
					});
				}
			});
		});
	}
});

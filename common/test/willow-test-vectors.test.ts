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

type AbsoluteEncodingSuite = {
	name: string;
	isValid(value: unknown): Promise<boolean> | boolean;

	type: "absolute";
	encode(val: unknown): Promise<ByteString> | ByteString;
	decode(provider: ByteProvider): Promise<unknown>;

	hasNoReencoded?: boolean;
};
type RelativeEncodingSuite = {
	name: string;
	isValid(value: unknown): Promise<boolean> | boolean;

	type: "relative";
	encode(val: unknown, rel: unknown): Promise<ByteString> | ByteString;
	decode(rel: unknown, provider: ByteProvider): Promise<unknown>;
	decodeSingle(provider: ByteProvider): Promise<unknown>;

	hasNoYay?: boolean;
	hasNoReencoded?: boolean;
};
type Suite = AbsoluteEncodingSuite | RelativeEncodingSuite;

describe("willow_test_vectors repository", () => {
	const suites: Suite[] = [
		// Non-canonic
		{
			name: "EncodeAreaInArea",
			type: "relative",
			encode(val: Area, rel: Area): ByteString {
				return Area.encodeAreaInArea(val, rel);
			},
			async decode(rel: Area, provider: ByteProvider): Promise<Area> {
				return Area.decodeAreaInArea(rel, provider, false);
			},
			async decodeSingle(provider: ByteProvider): Promise<Area> {
				return Area.decode(provider, false);
			},
			isValid(value: unknown): boolean {
				return Area.is(value) && Area.isValid(value);
			},
		},
		{
			name: "EncodeEntry",
			type: "absolute",
			encode(value: Entry): ByteString {
				return Entry.encode(value);
			},
			async decode(provider: ByteProvider): Promise<Entry> {
				return Entry.decode(provider, false);
			},
			async isValid(value: unknown): Promise<boolean> {
				return Entry.is(value) && (await Entry.isValid(value));
			},
		},
		{
			name: "EncodeMcCapability_1",
			type: "absolute",
			encode(value: Capability): ByteString {
				return Capability.encode(value);
			},
			async decode(provider: ByteProvider): Promise<Capability> {
				return Capability.decode(provider, false);
			},
			async isValid(value: unknown): Promise<boolean> {
				return Capability.is(value) && (await Capability.isValid(value));
			},
		},
		{
			name: "EncodeMcCapability_2",
			type: "absolute",
			encode(value: Capability): ByteString {
				return Capability.encode(value);
			},
			async decode(provider: ByteProvider): Promise<Capability> {
				return Capability.decode(provider, false);
			},
			async isValid(value: unknown): Promise<boolean> {
				return Capability.is(value) && (await Capability.isValid(value));
			},
		},
		{
			name: "EncodePath",
			type: "absolute",
			encode(value: Path): ByteString {
				return Path.encode(value);
			},
			async decode(provider: ByteProvider): Promise<Path> {
				return Path.decode(provider, false);
			},
			isValid(value: unknown): boolean {
				return Path.is(value) && Path.isValid(value);
			},
		},
		{
			name: "EncodePathExtendsPath",
			type: "relative",
			encode(val: Path, rel: Path): ByteString {
				return Path.encodePathExtendsPath(val, rel);
			},
			async decode(rel: Path, provider: ByteProvider): Promise<Path> {
				return Path.decodePathExtendsPath(rel, provider, false);
			},
			async decodeSingle(provider: ByteProvider): Promise<Path> {
				return Path.decode(provider, false);
			},
			isValid(value: unknown): boolean {
				return Path.is(value) && Path.isValid(value);
			},
		},
		{
			name: "EncodePathRelativePath",
			type: "relative",
			encode(val: Path, rel: Path): ByteString {
				return Path.encodePathRelativePath(val, rel);
			},
			async decode(rel: Path, provider: ByteProvider): Promise<Path> {
				return Path.decodePathRelativePath(rel, provider, false);
			},
			async decodeSingle(provider: ByteProvider): Promise<Path> {
				return Path.decode(provider, false);
			},
			isValid(value: unknown): boolean {
				return Path.is(value) && Path.isValid(value);
			},
		},

		// Canonic
		{
			name: "encode_area_in_area",
			type: "relative",
			encode(val: Area, rel: Area): ByteString {
				return Area.encodeAreaInArea(val, rel);
			},
			async decode(rel: Area, provider: ByteProvider): Promise<Area> {
				return Area.decodeAreaInArea(rel, provider, true);
			},
			async decodeSingle(provider: ByteProvider): Promise<Area> {
				return Area.decode(provider, true);
			},
			isValid(value: unknown): boolean {
				return Area.is(value) && Area.isValid(value);
			},
		},
		{
			name: "encode_entry",
			type: "absolute",
			hasNoReencoded: true,
			encode(value: Entry): ByteString {
				return Entry.encode(value);
			},
			async decode(provider: ByteProvider): Promise<Entry> {
				return Entry.decode(provider, true);
			},
			async isValid(value: unknown): Promise<boolean> {
				return Entry.is(value) && (await Entry.isValid(value));
			},
		},
		{
			name: "encode_mc_capability_1",
			type: "absolute",
			hasNoReencoded: true,
			encode(value: Capability): ByteString {
				return Capability.encode(value);
			},
			async decode(provider: ByteProvider): Promise<Capability> {
				return Capability.decode(provider, true);
			},
			async isValid(value: unknown): Promise<boolean> {
				return Capability.is(value) && (await Capability.isValid(value));
			},
		},
		{
			name: "encode_mc_capability_2",
			type: "absolute",
			hasNoReencoded: true,
			encode(value: Capability): ByteString {
				return Capability.encode(value);
			},
			async decode(provider: ByteProvider): Promise<Capability> {
				return Capability.decode(provider, true);
			},
			async isValid(value: unknown): Promise<boolean> {
				return Capability.is(value) && (await Capability.isValid(value));
			},
		},
		{
			name: "encode_path",
			type: "absolute",
			hasNoReencoded: true,
			encode(value: Path): ByteString {
				return Path.encode(value);
			},
			async decode(provider: ByteProvider): Promise<Path> {
				return Path.decode(provider, true);
			},
			isValid(value: unknown): boolean {
				return Path.is(value) && Path.isValid(value);
			},
		},
		{
			name: "path_extends_path",
			type: "relative",
			encode(val: Path, rel: Path): ByteString {
				return Path.encodePathExtendsPath(val, rel);
			},
			async decode(rel: Path, provider: ByteProvider): Promise<Path> {
				return Path.decodePathExtendsPath(rel, provider, true);
			},
			async decodeSingle(provider: ByteProvider): Promise<Path> {
				return Path.decode(provider, true);
			},
			isValid(value: unknown): boolean {
				return Path.is(value) && Path.isValid(value);
			},
		},
		{
			name: "path_rel_path",
			type: "relative",
			encode(val: Path, rel: Path): ByteString {
				return Path.encodePathRelativePath(val, rel);
			},
			async decode(rel: Path, provider: ByteProvider): Promise<Path> {
				return Path.decodePathRelativePath(rel, provider, true);
			},
			async decodeSingle(provider: ByteProvider): Promise<Path> {
				return Path.decode(provider, true);
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
				// Check reencoded dir existence
				const reencodedDirExists = fs.existsSync(reencodedDir);
				if (reencodedDirExists !== !suite.hasNoReencoded) {
					throw new Error("Invalid hasNoReencoded for " + suite.name);
				}

				for (const file of fs.readdirSync(yayDir)) {
					test(
						path.relative(
							path.resolve(import.meta.dirname, "willow_test_vectors"),
							path.resolve(yayDir, file),
						),
						async () => {
							const bytes = new Uint8Array(
								fs.readFileSync(path.resolve(yayDir, file)),
							);
							const provider = ByteProvider.of(bytes);

							let value: unknown;
							let rel: unknown;
							if (suite.type === "absolute") {
								value = await suite.decode(provider);
							} else if (suite.type === "relative") {
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
							if (suite.type === "absolute") {
								reencoded = await suite.encode(value);
							} else if (suite.type === "relative") {
								reencoded = await suite.encode(value, rel);
							}

							let expectedBytes: ByteString | undefined;
							if (suite.type === "relative" || !suite.hasNoReencoded) {
								expectedBytes = new Uint8Array(
									fs.readFileSync(path.resolve(reencodedDir, file)),
								);
							} else {
								expectedBytes = bytes;
							}

							assert(ByteString.is(reencoded));
							assert(expectedBytes);
							assert.deepStrictEqual(
								[...reencoded.values()],
								[...expectedBytes.values()],
							);
							assert(ByteString.equals(reencoded, expectedBytes));
						},
					);
				}
			});

			describe("nay", () => {
				for (const file of fs.readdirSync(nayDir)) {
					test(
						path.relative(
							path.resolve(import.meta.dirname, "willow_test_vectors"),
							path.resolve(nayDir, file),
						),
						async () => {
							const bytes = new Uint8Array(
								fs.readFileSync(path.resolve(nayDir, file)),
							);
							const provider = ByteProvider.of(bytes);

							let rel: unknown;
							if (suite.type === "relative") {
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
								if (suite.type === "absolute") {
									value = await suite.decode(provider);
								} else if (suite.type === "relative") {
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
						},
					);
				}
			});
		});
	}
});

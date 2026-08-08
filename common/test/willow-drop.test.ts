import assert from "node:assert";
import { describe } from "node:test";
import test from "node:test";

import { readStream } from "../src/index.js";
import {
	AuthorisedEntryWithPayload,
	ByteString,
	Drop,
	type DropDecodeSingleStep,
	type DropDecodeStep,
	Ed25519,
	NamespaceId,
	OPENSELVES_NAMESPACE_ID,
	Path,
	SubspaceId,
} from "../src/willow/index.js";

function execSimpleDecodeSteps(encoded: ByteString, steps: DropDecodeStep[]) {
	let consumedBytes = 0;
	let nextConsume: number | undefined;

	function doStep(step: DropDecodeSingleStep) {
		let consumed = step.consumedBytes;
		if (typeof nextConsume === "number") {
			consumed = nextConsume;
			nextConsume = undefined;
		}

		nextConsume = step.decode(
			encoded.slice(consumedBytes, consumedBytes + consumed),
			AuthorisedEntryWithPayload.default(),
		);
		consumedBytes += consumed;
	}

	for (const step of steps) {
		if ("decode" in step) {
			doStep(step);
		} else {
			for (const substep of step.steps) {
				assert("decode" in substep);
				doStep(substep);
			}
		}
	}
}

describe("Willow drop format", () => {
	test("Encode and decode header byte", async () => {
		const keys1 = await Ed25519.generateKey();
		const previousEntry = await AuthorisedEntryWithPayload.create(
			OPENSELVES_NAMESPACE_ID,
			keys1.publicKey,
			Path.fromString("/aa/bbb/cccc"),
			1234n,
			ByteString.fromUtf8("hello"),
			keys1,
		);
		const keys2 = await Ed25519.generateKey();
		const entry = await AuthorisedEntryWithPayload.create(
			OPENSELVES_NAMESPACE_ID,
			keys2.publicKey,
			Path.fromString("/aa/bbb/cccc/ddddd"),
			1235n,
			ByteString.fromUtf8("bye"),
			keys2,
		);
		const encoded = Drop.encodeHeaderByte(previousEntry, entry);
		const decoded = Drop.decodeHeaderByte(encoded.headerByte);
		assert.strictEqual(decoded.hasNamespaceId, encoded.hasNamespaceId);
		assert.strictEqual(decoded.hasSubspaceId, encoded.hasSubspaceId);
		assert.strictEqual(
			decoded.timestampAdditionalBytesLength,
			encoded.timestampAdditionalBytes.length,
		);
	});

	test("Encode and decode namespaceId", async () => {
		const namespaceId = (await Ed25519.generateKey()).publicKey;
		const encoded = NamespaceId.encode(namespaceId);
		const { namespaceId: decoded, consumedBytes } = NamespaceId.decode(encoded);
		assert.deepStrictEqual(namespaceId, decoded);
		assert.strictEqual(consumedBytes, NamespaceId.LENGTH);
	});

	test("Encode and decode subspaceId", async () => {
		const subspaceId = (await Ed25519.generateKey()).publicKey;
		const encoded = SubspaceId.encode(subspaceId);
		const decoded = SubspaceId.decode(encoded);
		assert.deepStrictEqual(decoded.subspaceId, subspaceId);
		assert.deepStrictEqual(decoded.consumedBytes, SubspaceId.LENGTH);
	});

	for (const expectedPath of [
		Path.EMPTY,
		Path.fromString("/"),
		Path.fromString("/a//b////c"),
		Path.fromString("/a/bb/ccc"),
	]) {
		test('Encode and decode path "' + Path.toString(expectedPath) + '"', () => {
			const encoded = Path.encodePath(expectedPath);

			assert.strictEqual(
				encoded[0],
				(expectedPath.reduce((prev, comp) => prev + comp.length, 0) << 4) |
					expectedPath.length,
			);

			let decodedPath: Path | undefined;
			const steps = Path.decodePath((val) => {
				decodedPath = val;
			});

			execSimpleDecodeSteps(encoded, steps);

			assert.deepStrictEqual(
				decodedPath && Path.toString(decodedPath),
				Path.toString(expectedPath),
			);
		});
	}

	for (const [expectedPath, rel] of [
		[Path.fromString("/a/bb/ccc"), Path.fromString("/a/bb")],
		[Path.fromString("/a/b/c"), Path.EMPTY],
		[Path.fromString("/a/b/c"), Path.fromString("/")],
		[Path.fromString("/uuu"), Path.EMPTY],
		[Path.fromString("/uuu"), Path.fromString("/")],
		[Path.EMPTY, Path.EMPTY],
	]) {
		test("Encode and decode encodePathRelativePath", () => {
			const encoded = Path.encodePathRelativePath(expectedPath, rel);

			let decodedPath: Path | undefined;
			const steps = Path.decodePathRelativePath(
				() => expectedPath,
				(val) => {
					decodedPath = val;
				},
			);

			execSimpleDecodeSteps(encoded, steps);

			assert.deepStrictEqual(
				decodedPath && Path.toString(decodedPath),
				Path.toString(expectedPath),
			);
		});

		test(
			"Path.encodePathRelativePath " +
				Path.toString(expectedPath) +
				"; " +
				Path.toString(rel),
			() => {
				const encodedPath = Path.encodePathRelativePath(expectedPath, rel);
				const { path: decodedPath, consumedBytes } = Path.decodePathRelativePathRaw(
					encodedPath,
					rel,
				);
				assert.deepStrictEqual(expectedPath, decodedPath);
				assert.deepStrictEqual(consumedBytes, encodedPath.length);
			},
		);
	}

	test("Full encode then decode", async () => {
		const keys = await Ed25519.generateKey();
		const entries: AuthorisedEntryWithPayload[] = await Promise.all([
			AuthorisedEntryWithPayload.create(
				OPENSELVES_NAMESPACE_ID,
				keys.publicKey,
				Path.fromString("/aa/bbb/cccc"),
				1234n,
				ByteString.fromUtf8("hello"),
				keys,
			),
		]);
		const encoder = Drop.encoder();
		const decoder = await Drop.decoder();

		const decodedEntries: AuthorisedEntryWithPayload[] = [];
		await Promise.all([
			(async () => {
				const writer = encoder.writable.getWriter();
				for (const entry of entries) {
					await writer.write(entry);
				}
				await writer.close();
			})(),
			encoder.readable.pipeTo(decoder.writable),
			readStream(decoder.readable, {
				onValue: (value) => {
					decodedEntries.push(value);
				},
			}),
		]);

		assert.deepStrictEqual(decodedEntries, entries);
	});
});

import assert from "node:assert";
import { describe } from "node:test";
import test from "node:test";

import {
	ByteString,
	Drop,
	type DropDecodeSingleStep,
	type DropDecodeStep,
	Ed25519,
	EntryWithPayload,
	EntryWrapper,
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
			EntryWithPayload.default(),
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
		const previousEntry = (
			await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				(await Ed25519.generateKey()).publicKey,
				Path.fromString("/aa/bbb/cccc"),
				1234n,
				ByteString.fromUtf8("hello"),
			)
		).entryWithPayload;
		const entry = (
			await EntryWrapper.create(
				OPENSELVES_NAMESPACE_ID,
				(await Ed25519.generateKey()).publicKey,
				Path.fromString("/aa/bbb/cccc/ddddd"),
				1235n,
				ByteString.fromUtf8("bye"),
			)
		).entryWithPayload;
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
		const decoded = NamespaceId.decode(encoded);
		assert.deepStrictEqual(namespaceId, decoded);
	});

	test("Encode and decode subspaceId", async () => {
		const subspaceId = (await Ed25519.generateKey()).publicKey;
		const encoded = SubspaceId.encode(subspaceId);
		const decoded = SubspaceId.decode(encoded);
		assert.deepStrictEqual(subspaceId, decoded);
	});

	test("Encode and decode path", () => {
		const path = Path.fromString("/a/bb/ccc");
		const encoded = Path.encodePath(path);

		assert.strictEqual(encoded[0], 0x63);

		let decodedPath: Path | undefined;
		const steps = Path.decodePath((val) => {
			decodedPath = val;
		});

		execSimpleDecodeSteps(encoded, steps);

		assert.deepStrictEqual(decodedPath && Path.toString(decodedPath), Path.toString(path));
	});

	test("Encode and decode encodePathRelativePath", () => {
		const previousPath = Path.fromString("/a/bb");
		const currentPath = Path.fromString("/a/bb/ccc");
		const encoded = Path.encodePathRelativePath(currentPath, previousPath);

		let decodedPath: Path | undefined;
		const steps = Path.decodePathRelativePath(
			() => previousPath,
			(val) => {
				decodedPath = val;
			},
		);

		execSimpleDecodeSteps(encoded, steps);

		assert.deepStrictEqual(
			decodedPath && Path.toString(decodedPath),
			Path.toString(currentPath),
		);
	});

	test("Full encode then decode", async () => {
		const entries: EntryWithPayload[] = (
			await Promise.all([
				EntryWrapper.create(
					OPENSELVES_NAMESPACE_ID,
					(await Ed25519.generateKey()).publicKey,
					Path.fromString("/aa/bbb/cccc"),
					1234n,
					ByteString.fromUtf8("hello"),
				),
			])
		).map((entry) => entry.entryWithPayload);
		const encoder = Drop.encoder();
		const decoder = Drop.decoder();

		const decodedEntries: EntryWithPayload[] = [];
		await Promise.all([
			(async () => {
				const writer = encoder.writable.getWriter();
				for (const entry of entries) {
					await writer.write(entry);
				}
				await writer.close();
			})(),
			encoder.readable.pipeTo(decoder.writable),
			(async () => {
				const reader = decoder.readable.getReader();
				while (true) {
					const result = await reader.read();

					if (result.value) {
						decodedEntries.push(result.value);
					}

					if (result.done) {
						break;
					}
				}
			})(),
		]);

		assert.deepStrictEqual(decodedEntries, entries);
	});
});

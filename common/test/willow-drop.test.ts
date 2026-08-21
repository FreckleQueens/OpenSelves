import assert from "node:assert";
import { describe } from "node:test";
import test from "node:test";

import { readStream } from "../src/index.js";
import { ByteProvider } from "../src/willow/ByteProvider.js";
import {
	AuthorisedEntryWithPayload,
	ByteString,
	Drop,
	Ed25519,
	NamespaceId,
	OPENSELVES_NAMESPACE_ID,
	Path,
	SubspaceId,
} from "../src/willow/index.js";

describe("Willow drop format", () => {
	test("Encode and decode namespaceId", async () => {
		const namespaceId = (await Ed25519.generateKey()).publicKey;
		const encoded = NamespaceId.encode(namespaceId);
		const provider = ByteProvider.of(encoded);
		const decoded = await NamespaceId.decode(provider);

		assert.deepStrictEqual(namespaceId, decoded);
		provider.endRead();
	});

	test("Encode and decode subspaceId", async () => {
		const subspaceId = (await Ed25519.generateKey()).publicKey;
		const encoded = SubspaceId.encode(subspaceId);
		const provider = ByteProvider.of(encoded);
		const decoded = await SubspaceId.decode(provider);
		assert.deepStrictEqual(decoded, subspaceId);
		provider.endRead();
	});

	for (const expectedPath of [
		Path.EMPTY,
		Path.fromString("/"),
		Path.fromString("/a//b////c"),
		Path.fromString("/a/bb/ccc"),
	]) {
		test('Encode and decode path "' + Path.toString(expectedPath) + '"', async () => {
			const encoded = Path.encode(expectedPath);

			assert.strictEqual(
				encoded[0],
				(expectedPath.reduce((prev, comp) => prev + comp.length, 0) << 4) |
					expectedPath.length,
			);

			const provider = ByteProvider.of(encoded);
			const decodedPath = await Path.decode(provider, false);

			assert.deepStrictEqual(Path.toString(decodedPath), Path.toString(expectedPath));
			provider.endRead();
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
		test("Encode and decode encodePathRelativePath", async () => {
			const encoded = Path.encodePathRelativePath(expectedPath, rel);

			const provider = ByteProvider.of(encoded);
			const decodedPath = await Path.decodePathRelativePath(rel, provider, false);

			assert.deepStrictEqual(
				decodedPath && Path.toString(decodedPath),
				Path.toString(expectedPath),
			);
			provider.endRead();
		});

		test(
			"Path.encodePathRelativePath " +
				Path.toString(expectedPath) +
				"; " +
				Path.toString(rel),
			async () => {
				const encodedPath = Path.encodePathRelativePath(expectedPath, rel);
				const provider = ByteProvider.of(encodedPath);
				const decodedPath = await Path.decodePathRelativePath(rel, provider, false);
				assert.deepStrictEqual(expectedPath, decodedPath);
				provider.endRead();
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
		const decoder = Drop.decoder();

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

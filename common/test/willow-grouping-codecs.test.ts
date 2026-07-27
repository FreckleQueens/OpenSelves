import assert from "node:assert";
import test, { describe } from "node:test";

import { Area } from "../src/willow/Area.js";
import { Ed25519 } from "../src/willow/Ed25519.js";
import { Path } from "../src/willow/Path.js";

describe("willow grouping codecs", async () => {
	const subspace = await Ed25519.generateKey();
	for (const expectedArea of [
		{
			subspaceId: subspace.publicKey,
			path: Path.EMPTY,
			times: {
				start: 0n,
				end: undefined,
			},
		},
		{
			subspaceId: subspace.publicKey,
			path: Path.fromString("/a/b/c"),
			times: {
				start: 0n,
				end: undefined,
			},
		},
		{
			subspaceId: subspace.publicKey,
			path: Path.EMPTY,
			times: {
				start: 157n,
				end: undefined,
			},
		},
		{
			subspaceId: subspace.publicKey,
			path: Path.EMPTY,
			times: {
				start: 0n,
				end: 157n,
			},
		},
		{
			subspaceId: subspace.publicKey,
			path: Path.EMPTY,
			times: {
				start: 77n,
				end: 157n,
			},
		},
		{
			subspaceId: subspace.publicKey,
			path: Path.fromString("/uuu"),
			times: {
				start: 77n,
				end: 157n,
			},
		},
	] satisfies Area[]) {
		test(
			"Area.decodeAreaInArea " +
				expectedArea.subspaceId.toHex() +
				"; " +
				Path.toString(expectedArea.path) +
				"; " +
				expectedArea.times.start +
				"; " +
				expectedArea.times.end,
			() => {
				const rel = Area.ofSubspace(subspace.publicKey);
				const encodedArea = Area.encodeAreaInArea(expectedArea, rel);
				const { area: decodedArea, consumedBytes } = Area.decodeAreaInArea(
					encodedArea,
					rel,
				);
				assert.deepStrictEqual(decodedArea, expectedArea);
				assert.strictEqual(consumedBytes, encodedArea.length);
			},
		);
	}
});

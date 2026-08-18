import assert from "node:assert";
import test, { describe } from "node:test";

import { ByteProvider } from "../src/willow/ByteProvider.js";
import { Path } from "../src/willow/Path.js";
import { Timestamp } from "../src/willow/Timestamp.js";
import { UInt64 } from "../src/willow/UInt64.js";

describe("willow codecs", () => {
	for (const expectedPath of [
		Path.EMPTY,
		Path.fromString("/"),
		Path.fromString("/a/b///ccccc/d"),
	]) {
		test("Path.encodePath " + Path.toString(expectedPath), async () => {
			const encodedPath = Path.encode(expectedPath);
			const provider = ByteProvider.of(encodedPath);
			const decodedPath = await Path.decode(provider);
			assert.deepStrictEqual(decodedPath, expectedPath);
			provider.endRead();
		});
	}

	for (const expectedValue of [
		0n,
		1n,
		2n,
		7n,
		8n,
		9n,
		15n,
		16n,
		17n,
		800n,
		Timestamp.now(),
		UInt64.MAX_VALUE,
	]) {
		test("UInt64.encodeVariable " + expectedValue.toString(), async () => {
			for (let tagWidth = 2; tagWidth < 8; tagWidth++) {
				for (let headerPosition = 0; headerPosition < 8; headerPosition++) {
					const endPosition = headerPosition + tagWidth;
					if (endPosition > 7) {
						continue;
					}

					const { headerByte, additionalBytes } = UInt64.encodeVariable(
						expectedValue,
						0,
						tagWidth,
						headerPosition,
					);
					const provider = ByteProvider.of(additionalBytes);
					const decodedValue = await UInt64.decodeVariable(
						headerByte,
						tagWidth,
						headerPosition,
						provider,
					);
					try {
						assert.strictEqual(decodedValue, expectedValue);
						provider.endRead();
					} catch (e) {
						// eslint-disable-next-line @typescript-eslint/only-throw-error
						throw {
							error: e,
							actualValue: decodedValue,
							expectedValue,
							headerByte: headerByte.toString(2),
							tagWidth,
							headerPosition,
						};
					}
				}
			}
		});
	}
});

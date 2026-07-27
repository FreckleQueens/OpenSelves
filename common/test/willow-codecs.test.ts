import assert from "node:assert";
import test, { describe } from "node:test";

import { Path } from "../src/willow/Path.js";
import { Timestamp } from "../src/willow/Timestamp.js";
import { UInt64 } from "../src/willow/UInt64.js";

describe("willow codecs", () => {
	for (const expectedPath of [
		Path.EMPTY,
		Path.fromString("/"),
		Path.fromString("/a/b///ccccc/d"),
	]) {
		test("Path.encodePath " + Path.toString(expectedPath), () => {
			const encodedPath = Path.encodePath(expectedPath);
			const { path: decodedPath, consumedBytes } = Path.decodePathRaw(encodedPath);
			assert.deepStrictEqual(decodedPath, expectedPath);
			assert.strictEqual(consumedBytes, encodedPath.length);
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
		test("UInt64.encodeVariable " + expectedValue.toString(), () => {
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
					const { value: decodedValue, consumedBytes } = UInt64.decodeVariable(
						headerByte,
						tagWidth,
						headerPosition,
						additionalBytes,
					);
					try {
						assert.strictEqual(decodedValue, expectedValue);
						assert.strictEqual(consumedBytes, additionalBytes.length);
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

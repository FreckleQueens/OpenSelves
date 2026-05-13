import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { type Solution, solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/argon2id";
import assert from "node:assert";
import { after, afterEach, describe, mock, test } from "node:test";

import type { TestEnv } from "./utils.ts";

const EXPECTED_MIN_COUNTER = 40;

async function mockRandomInt(
	callback: (max: number, min?: number) => number = (max, min) =>
		typeof min === "number" ? min : max,
) {
	const fn = mock.fn((max: number, min?: number): number => {
		return callback(max, min);
	});
	const original = await import("altcha-lib");
	const { default: defaultExport, ...namedExports } = original;
	mock.module("altcha-lib", {
		defaultExport: {
			...defaultExport,
			randomInt: fn,
		},
		namedExports: {
			...namedExports,
			randomInt: fn,
		},
	});
	return fn;
}

describe("/captcha/generate", async () => {
	const fn = await mockRandomInt(
		(max, min) => (typeof min === "number" ? min : max) / EXPECTED_MIN_COUNTER,
	);

	after(() => {
		mock.reset();
	});

	let env: TestEnv;

	(await import("./utils.js")).setupTestSuite((testEnv) => {
		env = testEnv;
	}, false);

	afterEach(async () => {
		await env.app.get<Cache>(CACHE_MANAGER).clear();
		fn.mock.resetCalls();
	});

	test("POST challenge format 200", async () => {
		const response = await env.request
			.get("/captcha/challenge")
			.expect("Content-Type", /json/)
			.expect(200);

		const challenge = response.body;
		assert.notStrictEqual(challenge, undefined);
		assert.notStrictEqual(challenge.signature, undefined);
		assert.partialDeepStrictEqual(challenge, {
			parameters: {
				algorithm: "ARGON2ID",
				cost: 3,
				memoryCost: 65536,
				parallelism: 1,
			},
		});
		for (const param of [
			"expiresAt",
			"keyLength",
			"keyPrefix",
			"keySignature",
			"nonce",
			"salt",
		]) {
			assert.notStrictEqual(challenge.parameters[param], undefined);
		}
		assert(
			Math.abs(
				challenge.parameters.expiresAt - Math.floor((Date.now() + 5 * 60 * 1000) / 1000),
			) < 5,
		);
	});

	test("POST same ip multiple times 200", async () => {
		for (let i = 0; i < 10; i++) {
			const response = await env.request
				.get("/captcha/challenge")
				.set("X-Forwarded-For", "1.1.1.1")
				.expect("Content-Type", /json/)
				.expect(200);
			const solution: Solution | null = await solveChallenge({
				challenge: response.body,
				deriveKey,
				timeout: 1000,
				counterStart: i + 1,
			});
			assert.notStrictEqual(solution, null);
			assert.strictEqual(solution?.counter, i + 1);
		}

		assert.strictEqual(fn.mock.callCount(), 10);
		for (let i = 0; i < 10; i++) {
			assert.deepStrictEqual(fn.mock.calls[i].arguments, [
				EXPECTED_MIN_COUNTER * (i + 1) * 2,
				EXPECTED_MIN_COUNTER * (i + 1),
			]);
		}
	});

	test("POST same ip multiple times then different ip 200", async () => {
		for (let i = 0; i < 10; i++) {
			await env.request
				.get("/captcha/challenge")
				.set("X-Forwarded-For", "1.1.1.1")
				.expect("Content-Type", /json/)
				.expect(200);
		}

		fn.mock.resetCalls();

		await env.request
			.get("/captcha/challenge")
			.set("X-Forwarded-For", "2.2.2.2")
			.expect("Content-Type", /json/)
			.expect(200);

		assert.strictEqual(fn.mock.callCount(), 1);
		assert.deepStrictEqual(fn.mock.calls[0].arguments, [
			EXPECTED_MIN_COUNTER * 2,
			EXPECTED_MIN_COUNTER,
		]);
	});
});

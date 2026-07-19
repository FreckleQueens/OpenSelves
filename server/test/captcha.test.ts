import { type Solution, solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/argon2id";
import assert from "node:assert";
import { describe, test } from "node:test";
import { isValidSchemaStatic } from "openselves-common/schema";

import { challengeSchema } from "../src/captcha/captcha-type-helpers.js";
import { type TestEnv, setupTestSuite } from "./utils.js";

async function verifySolutionCounter(rawExpectedFactor: number, response: { body: unknown }) {
	assert(isValidSchemaStatic(challengeSchema, response.body));
	const expectedFactor = Math.max(1, Math.min(rawExpectedFactor, 10));
	const solution: Solution | null = await solveChallenge({
		challenge: response.body,
		deriveKey,
		counterStart: expectedFactor * 40,
	});
	assert(solution);
	assert(solution.counter >= expectedFactor * 40);
	assert(solution.counter <= expectedFactor * 80);
}

describe("/captcha/generate", () => {
	let env: TestEnv;

	setupTestSuite((testEnv) => {
		env = testEnv;
	}, false);

	test("POST challenge format 200", async () => {
		const response = await env.rawRequest
			.get("/captcha/challenge")
			.randomXForwardedFor()
			.expect(200)
			.json();

		const challenge = response.body;
		assert.notStrictEqual(challenge, undefined);
		assert.notStrictEqual(challenge["signature"], undefined);
		assert.partialDeepStrictEqual(challenge, {
			parameters: {
				algorithm: "ARGON2ID",
				cost: 3,
				memoryCost: 16384,
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
			"data",
		]) {
			assert.notStrictEqual(challenge["parameters"][param], undefined);
		}
		assert(
			Math.abs(
				challenge["parameters"].expiresAt - Math.floor((Date.now() + 5 * 60 * 1000) / 1000),
			) < 5,
		);
	});

	test("POST same ip multiple times 200", async () => {
		for (let i = 0; i < 10; i++) {
			const response = await env.rawRequest
				.get("/captcha/challenge")
				.set("X-Forwarded-For", "1.1.1.1")
				.expect(200)
				.json();
			await verifySolutionCounter(i + 1, response);
		}
	});

	test("POST same ip multiple times then different ip 200", async () => {
		for (let i = 0; i < 10; i++) {
			await env.rawRequest
				.get("/captcha/challenge")
				.set("X-Forwarded-For", "1.1.1.1")
				.expect(200)
				.json();
		}

		const response = await env.rawRequest
			.get("/captcha/challenge")
			.set("X-Forwarded-For", "2.2.2.2")
			.expect(200)
			.json();
		await verifySolutionCounter(1, response);
	});

	test("POST same email multiple 200", async () => {
		for (let i = 0; i < 7; i++) {
			const response = await env.rawRequest
				.get("/captcha/challenge/sendEmail/same@same.example.com")
				.set("X-Forwarded-For", `${i + 3}.${i + 3}.${i + 3}.${i + 3}`)
				.expect(200)
				.json();
			await verifySolutionCounter(1 + i * 2, response);
		}
	});
});

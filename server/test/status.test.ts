import assert from "node:assert";
import test, { describe } from "node:test";
import { API_VERSION } from "openselves-common";

import { type TestEnv, setupTestSuite } from "./utils.js";

describe("/status", () => {
	let env: TestEnv;

	setupTestSuite((testEnv) => {
		env = testEnv;
	});

	test("GET", async () => {
		const response = await env.request
			.get("/status")
			.set("X-OpenSelves-Version", API_VERSION)
			.expect("Content-Type", /json/)
			.expect("X-OpenSelves-Version", API_VERSION)
			.expect(200);

		assert.notStrictEqual(response.body, undefined);
		assert.strictEqual(response.body.ready, true);
		assert.notStrictEqual(response.body.version, undefined);
		assert.strictEqual(typeof response.body.version, "string");
		assert.match(response.body.version, /^((([1-9][0-9]*)|0)\.){2}(([1-9][0-9]*)|0)$/);
		assert.strictEqual(response.body.version, API_VERSION);
		assert.strictEqual(
			response.body.maxUploadSize,
			env.configService.getOrThrow("MAX_UPLOAD_SIZE", { infer: true }),
		);
		assert.strictEqual(response.body.areRegistrationsOpen, false);
		assert.strictEqual(
			response.body.unverifiedAccountCullingDelay,
			env.configService.getOrThrow("UNVERIFIED_ACCOUNT_CULLING_DELAY", { infer: true }),
		);
	});

	test("GET incorrect version", async () => {
		const response = await env.request
			.get("/status")
			.set("X-OpenSelves-Version", "0.0.1") // wrong version
			.expect("Content-Type", /json/)
			.expect("X-OpenSelves-Version", API_VERSION)
			.expect(406);
		assert.strictEqual(response.body.expectedVersion, API_VERSION);
	});
});

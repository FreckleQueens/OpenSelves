import { describe, expect, test } from "@jest/globals";
import { API_VERSION } from "openselves-common";

import { type TestEnv, setupTestSuite } from "./utils.js";

describe("/status", () => {
	let env: TestEnv;

	setupTestSuite((testEnv) => {
		env = testEnv;
	}, true);

	test("GET", async () => {
		const response = await env.request
			.get("/status")
			.set("X-OpenSelves-Version", API_VERSION)
			.expect("Content-Type", /json/)
			.expect("X-OpenSelves-Version", API_VERSION)
			.expect(200);

		expect(response.body).toBeDefined();
		expect(response.body.ready).toBe(true);
		expect(response.body.version).toBeDefined();
		expect(typeof response.body.version).toBe("string");
		expect(response.body.version).toMatch(/^((([1-9][0-9]*)|0)\.){2}(([1-9][0-9]*)|0)$/);
		expect(response.body.version).toBe(API_VERSION);
		expect(response.body.maxUploadSize).toBe(
			env.configService.getOrThrow("MAX_UPLOAD_SIZE", { infer: true }),
		);
	});

	test("GET incorrect version", async () => {
		const response = await env.request
			.get("/status")
			.set("X-OpenSelves-Version", "0.0.1") // wrong version
			.expect("Content-Type", /json/)
			.expect("X-OpenSelves-Version", API_VERSION)
			.expect(406);
		expect(response.body.expectedVersion).toBe(API_VERSION);
	});
});

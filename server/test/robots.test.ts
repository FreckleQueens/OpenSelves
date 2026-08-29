import assert from "node:assert";
import test, { describe } from "node:test";

import { type TestEnv, setupTestSuite } from "./utils.js";

describe("robots.txt", () => {
	let env: TestEnv;

	setupTestSuite((testEnv) => {
		env = testEnv;
	});

	for (const accept of ["text/plain", "application/json"]) {
		test("GET /robots.txt 200 " + accept, async () => {
			const response = await env.rawRequest
				.get("/robots.txt")
				.randomXForwardedFor()
				.accept(accept, false)
				.expect(200)
				.execute();
			assert.strictEqual(response.headers.get("Content-Type"), "text/plain; charset=utf-8");
			assert.strictEqual(await response.text(), "user-agent: *\ndisallow: /\n");
		});
	}
});

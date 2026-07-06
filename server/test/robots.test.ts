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
			const response = await env.request.get("/robots.txt").accept(accept).expect(200);
			assert(response.headers["content-type"]);
			assert.strictEqual(response.headers["content-type"], "text/plain; charset=utf-8");
			assert.strictEqual(typeof response.text, "string");
			assert.strictEqual(response.text, "user-agent: *\ndisallow: /\n");
		});
	}
});

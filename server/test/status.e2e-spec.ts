import { describe, expect, test } from "@jest/globals";
import request from "supertest";

import rootPackage from "../../package.json" with { type: "json" };
import { type TestEnv, setupTestSuite } from "./utils.js";

describe("/status", () => {
	let env: TestEnv;

	setupTestSuite((testEnv) => {
		env = testEnv;
	}, true);

	test("GET", async () => {
		const response = await request(env.server)
			.get("/status")
			.expect("Content-Type", /json/)
			.expect(200);

		expect(response.body).toBeDefined();
		expect(response.body.ready).toBe(true);
		expect(response.body.version).toBeDefined();
		expect(typeof response.body.version).toBe("string");
		expect(response.body.version).toMatch(/^((([1-9][0-9]*)|0)\.){2}(([1-9][0-9]*)|0)$/);
		expect(response.body.version).toBe(rootPackage.version);
	});
});

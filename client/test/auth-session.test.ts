import assert from "node:assert";
import test, { describe } from "node:test";

import { setupPuppeteer } from "./utils.js";

describe("Auth session", () => {
	const ctx = setupPuppeteer();

	test("short lived session logs out", async () => {
		await ctx.registerAndLoginUser();
		await ctx.goto("about:blank", undefined, false);
		// Wait the configured REFRESH_TOKEN_SHORT_DURATION (see package.json)
		await ctx.waitForTimeout(10000);
		await ctx.goto("/account");
		await ctx.waitForResponse("/user/", false);
		await ctx.waitForNavigation(/\/land\?session_expired=1/, 5000);
	});

	test("long lived session doesn't log out", async () => {
		await ctx.registerAndLoginUser(true);
		await ctx.goto("about:blank", undefined, false);
		// Wait the configured REFRESH_TOKEN_SHORT_DURATION (see package.json)
		await ctx.waitForTimeout(10000);
		await ctx.goto("/account", undefined, false);

		await ctx.waitForResponse("/user/", false);
		await ctx.waitForResponse("/user/", true);

		await ctx.waitForTimeout(3000);
		assert(ctx.page.url().endsWith("/account"));
	});
});

import test, { describe } from "node:test";

import { setupPuppeteer } from "./utils.js";

describe("Session", () => {
	const ctx = setupPuppeteer();

	test("session expires after REFRESH_TOKEN_SHORT_DURATION", async () => {
		await ctx.createProfileAndLogin();
		await ctx.goto("about:blank", undefined, false);
		// Wait the configured REFRESH_TOKEN_SHORT_DURATION (see package.json)
		await ctx.waitForTimeout(10000);
		await ctx.goto("/profile");
		await ctx.waitForResponse("/sync/pull", false);
		await ctx.waitForResponse("/auth/refresh", false);
		await ctx.waitForResponse("/auth/login", true);
		await ctx.waitForResponse("/sync/pull", true);
	});

	test("session doesn't expire before REFRESH_TOKEN_SHORT_DURATION", async () => {
		await ctx.createProfileAndLogin();
		await ctx.goto("about:blank", undefined, false);
		// Wait less than configured REFRESH_TOKEN_SHORT_DURATION (see package.json)
		await ctx.waitForTimeout(8000);
		await ctx.goto("/profile", undefined, false);

		await ctx.waitForResponse("/sync/pull", false);
		await ctx.waitForResponse("/auth/refresh", true);
		await ctx.waitForResponse("/sync/pull", true);
	});
});

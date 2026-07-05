import test, { describe } from "node:test";

import { setupPuppeteer } from "./utils.js";

describe("i18n", () => {
	const ctx = setupPuppeteer();

	test("land page", async () => {
		await ctx.goto("/");
		await ctx.waitForNavigation("/land?from_index_page=1");

		await ctx.locator("select[name=language]").wait();
		await ctx.page.select("select[name=language]", "fr");
		await ctx.locator("#continue-button").click();
		await ctx.waitForNavigation("/auth?landed=1");
	});

	test("change lang", async () => {
		await ctx.goto("/auth");

		await ctx.locator("#settings-link").click();
		await ctx.waitForNavigation("/auth/settings");

		await ctx.locator("select[name=language]").wait();
		await ctx.page.select("select[name=language]", "fr");
		await ctx.waitForNavigation("/auth/settings", undefined, true);
		await ctx.expectNoAppError();

		await ctx.locator("select[name=language]").wait();
		await ctx.page.select("select[name=language]", "en");
		await ctx.waitForNavigation("/auth/settings", undefined, true);
		await ctx.expectNoAppError();

		await ctx.locator("#back-link").click();
		await ctx.waitForNavigation("/auth", undefined, true);

		await ctx.expectNoAppError();
	});
});

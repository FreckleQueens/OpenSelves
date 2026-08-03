import assert from "node:assert";
import test, { describe } from "node:test";

import { setupPuppeteer } from "./utils.js";

describe("Profile basics", () => {
	const ctx = setupPuppeteer();

	test("create profile", async () => {
		const profileName = await ctx.createProfileAndLogin();
		await ctx.goto("/profile");
		await ctx.expectPageContains(profileName);
	});

	test("logout and login", async () => {
		const profileName = await ctx.createProfileAndLogin();
		await ctx.logout();

		await ctx.goto("/profiles");

		await ctx.withinProfileCard(profileName).locator(".login-button").click();

		await ctx.waitForNavigation("/dashboard?logged_in=1");
		await ctx.goto("/profile");
		await ctx.expectPageContains(profileName);
	});

	test("logout wipe data", async () => {
		const profileName = await ctx.createProfileAndLogin();
		await ctx.logout(false);
		await ctx.expectNoAppError();

		await ctx.goto("/profiles", true, true);
		assert(!(await ctx.page.content()).includes(profileName));
		await ctx.expectNoAppError();
	});

	test("turn sync off", async () => {
		const profileName = await ctx.createProfileAndLogin();
		await ctx.logout();

		await ctx.goto("/profiles");
		await ctx.withinProfileCard(profileName).locator(".edit-button").click();

		await ctx.waitForNavigation(/^\/profiles\/edit\/[a-zA-Z0-9]{24}$/g);
		await ctx.locator("#enable-sync-checkbox").click();
		await ctx.locator("#save-record-button").click();

		await ctx.waitForNavigation("/profiles");
		await ctx.withinProfileCard(profileName).locator(".login-button").click();

		await ctx.waitForNavigation("/dashboard?logged_in=1");
		await ctx.goto("/profile");
		await ctx.expectPageContains(profileName);
		await ctx.expectNoAppError();
	});

	test.only("create profile with sync off", async () => {
		const syncOnProfileName = await ctx.createProfileAndLogin();
		await ctx.logout();

		await ctx.goto("/profiles");
		await ctx.locator("#create-profile-button").click();

		await ctx.waitForNavigation("/profiles/edit");
		const profileName = "test";
		await ctx.locator("input[name=name]").fill(profileName);
		await ctx.locator("#enable-sync-checkbox").click();
		await ctx.locator("#save-record-button").click();

		await ctx.waitForNavigation("/profiles");
		const profileCardSelector = ctx.withinProfileCard(profileName).selector;
		await ctx.locator(profileCardSelector).wait();
		assert.strictEqual(
			(
				await ctx.page.$$(
					`${ctx.withinProfileCard(syncOnProfileName).selector}[data-profile-sync-enabled="true"]`,
				)
			).length,
			1,
		);
		assert.strictEqual(
			(await ctx.page.$$(`${profileCardSelector}[data-profile-sync-enabled="false"]`)).length,
			1,
		);
	});
});

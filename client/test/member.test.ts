import assert from "node:assert";
import test, { describe } from "node:test";

import { setupPuppeteer } from "./utils.js";

describe("Member", () => {
	const ctx = setupPuppeteer();

	test("create member", async () => {
		await ctx.createProfileAndLogin();

		const pushRequest = ctx.waitForResponse("/sync/push", true);
		const member = await ctx.createMember();
		await pushRequest;

		assert.strictEqual(
			(await ctx.page.$$(`#not-fronting-members ${ctx.getMemberEntrySelector(member)}`))
				.length,
			1,
		);
	});

	test("update member no change", async () => {
		await ctx.createProfileAndLogin();
		const member = await ctx.createMember();

		const previousEntriesCount = await ctx.getEntriesCount();
		await ctx
			.locator(`#not-fronting-members ${ctx.getMemberEntrySelector(member)} .member-card`)
			.click();
		await ctx.waitForNavigation(/^\/members\/[0-9a-f]{64}\/edit\/.+$/g);
		await ctx.locator("#save-record-button").click();

		await ctx.waitForNavigation("/members");

		const newEntriesCount = await ctx.getEntriesCount();
		assert.strictEqual(newEntriesCount, previousEntriesCount);
	});
});

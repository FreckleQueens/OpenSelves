import assert from "node:assert";
import test, { describe } from "node:test";

import { setupPuppeteer } from "./utils.js";

describe("Member", () => {
	const ctx = setupPuppeteer();

	test("create member", async () => {
		await ctx.registerAndLoginUser();

		const pushRequest = ctx.waitForResponse("/sync/push", false);
		const member = await ctx.createMember();
		await pushRequest;
		await ctx.waitForResponse("/sync/push", true);

		assert.strictEqual(
			(await ctx.page.$$(`#not-fronting-members ${ctx.getMemberEntrySelector(member)}`))
				.length,
			1,
		);
	});

	test("update member no change", async () => {
		await ctx.registerAndLoginUser();
		const member = await ctx.createMember();

		const previousLogsCount = await ctx.getEntriesCount();
		await ctx
			.locator(`#not-fronting-members ${ctx.getMemberEntrySelector(member)} .member-card`)
			.click();
		await ctx.locator("#save-record-button").click();

		await ctx.waitForNavigation("/members");

		const newLogsCount = await ctx.getEntriesCount();
		assert.strictEqual(newLogsCount, previousLogsCount);
	});
});

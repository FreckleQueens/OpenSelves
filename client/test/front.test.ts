import assert from "node:assert";
import test, { describe } from "node:test";

import { setupPuppeteer } from "./utils.js";

describe("Front", () => {
	const ctx = setupPuppeteer();

	async function createFront(member: { name: string; pronouns: string }) {
		await ctx.goto("/members");
		await ctx
			.locator(
				`#not-fronting-members ${ctx.getMemberEntrySelector(member)} .start-front-button`,
			)
			.click();
		const frontingMemberEntrySelector = `#current-fronting-members ${ctx.getMemberEntrySelector(member)}`;
		await ctx.locator(frontingMemberEntrySelector).setTimeout(5000).wait();
		assert.strictEqual((await ctx.page.$$(frontingMemberEntrySelector)).length, 1);

		await ctx.goto("/dashboard", undefined, true);
		assert.strictEqual((await ctx.page.$$(frontingMemberEntrySelector)).length, 1);

		await ctx.goto("/members");
	}

	test("create front", async () => {
		await ctx.registerAndLoginUser();
		const member = await ctx.createMember();
		await createFront(member);
	});

	test("create front then delete member", async () => {
		await ctx.registerAndLoginUser();
		const member = await ctx.createMember();
		await createFront(member);

		await ctx.goto("/members");
		await ctx.locator(`${ctx.getMemberEntrySelector(member)} .member-card`).click();
		await ctx.locator("#settings-tab-button").click();
		await ctx.locator("#delete-record-button").click();
		await ctx.clickOnOpeningDialogButtonWithId("delete-record-confirm-button");

		await ctx.waitForNavigation("/members", undefined, true);
		assert.strictEqual((await ctx.page.$$(ctx.getMemberEntrySelector(member))).length, 0);

		await ctx.goto("/dashboard", undefined, true);
		assert.strictEqual((await ctx.page.$$(ctx.getMemberEntrySelector(member))).length, 0);
		await ctx.expectNoAppError();
	});

	test("end front", async () => {
		await ctx.registerAndLoginUser();
		const member = await ctx.createMember();
		await createFront(member);

		const memberEntrySelector = `#current-fronting-members ${ctx.getMemberEntrySelector(member)}`;
		await ctx.locator(`${memberEntrySelector} .end-front-button`).click();
		await ctx
			.locator(`#not-fronting-members ${ctx.getMemberEntrySelector(member)}`)
			.setTimeout(5000)
			.wait();
		assert.strictEqual((await ctx.page.$$(memberEntrySelector)).length, 0);
		await ctx.expectNoAppError();
	});
});

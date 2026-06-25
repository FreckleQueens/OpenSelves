import { expect, test } from "@playwright/test";
import type { Page } from "playwright";

import { createMember, expectNoAppError, getMemberEntry, registerAndLoginUser } from "./utils";

async function createFront(page: Page, member: { name: string; pronouns: string }) {
	await page.goto("/members");
	await getMemberEntry(page.locator("#not-fronting-members"), member)
		.locator(".start-front-button")
		.click();
	await expect(getMemberEntry(page.locator("#current-fronting-members"), member)).toHaveCount(1);

	await page.goto("/dashboard");
	await expect(getMemberEntry(page.locator("#current-fronting-members"), member)).toHaveCount(1);

	await page.goto("/members");
}

test("create front", async ({ page }) => {
	await registerAndLoginUser(page);
	const member = await createMember(page);
	await createFront(page, member);
});

test("create front then delete member", async ({ page }) => {
	await registerAndLoginUser(page);
	const member = await createMember(page);
	await createFront(page, member);

	await page.goto("/members");
	await getMemberEntry(page, member).locator(".member-card").click();
	await page.locator("#settings-tab-button").click();
	await page.locator("#delete-record-button").click();
	await page.locator("#delete-record-confirm-button").click();
	await page.waitForURL("/members");

	await expect(getMemberEntry(page, member)).toHaveCount(0);

	await page.goto("/dashboard");
	await expect(page.locator(".no-front")).toHaveCount(1);
	await expect(getMemberEntry(page, member)).toHaveCount(0);
	await expectNoAppError(page);
});

test("end front", async ({ page }) => {
	await registerAndLoginUser(page);
	const member = await createMember(page);
	await createFront(page, member);

	const memberEntry = getMemberEntry(page.locator("#current-fronting-members"), member);
	await memberEntry.locator(`.end-front-button`).click();
	await memberEntry.waitFor({
		timeout: 5000,
	});
	await expect(memberEntry).toHaveCount(0);
	await expectNoAppError(page);
});

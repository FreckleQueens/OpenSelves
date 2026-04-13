import { expect, test } from "@playwright/test";
import type { Page } from "playwright";

import { createMember, expectNoAppError, getMemberEntry, registerAndLoginUser } from "./utils";

async function createFront(page: Page, member: { name: string; pronouns: string }) {
	await page.goto("/front");
	await page.locator("#open-fab-menu-button").click();
	await page.locator("#add-front-button").click();
	await getMemberEntry(page, member).locator(".member-card").click();

	await expect(getMemberEntry(page.locator("#current-fronting-members"), member)).toHaveCount(1);
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
	await page.locator("#delete-member-button").click();
	await page.locator("#delete-member-confirm-button").click();
	await page.waitForURL("/members");

	await expect(getMemberEntry(page, member)).toHaveCount(0);

	await page.goto("/front");
	await expect(page.locator(".no-front")).toHaveCount(1);
	await expect(getMemberEntry(page, member)).toHaveCount(0);
	await expectNoAppError(page);
});

test("end front", async ({ page }) => {
	await registerAndLoginUser(page);
	const member = await createMember(page);
	await createFront(page, member);

	await getMemberEntry(page, member).locator(`.end-front-button`).click();
	await expect(getMemberEntry(page.locator("#current-fronting-members"), member)).toHaveCount(0);
	await expectNoAppError(page);
});

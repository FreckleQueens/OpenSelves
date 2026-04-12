import { expect, test } from "@playwright/test";
import type { Page } from "playwright";

import { createMember, registerAndLoginUser } from "./utils";

const getMemberEntry = (page: Page, member: { name: string; pronouns: string }) =>
	page.getByRole("link", { name: `${member.name} ${member.pronouns}` });

async function createFront(page: Page, member: { name: string; pronouns: string }) {
	await page.goto("/front");
	await page.locator("#open-fab-menu-button").click();
	await page.locator("#add-front-button").click();
	await page.getByRole("link", { name: member.name }).click();

	await expect(getMemberEntry(page, member)).toBeVisible();
}

test("create front", async ({ page }) => {
	await registerAndLoginUser(page);
	const member = await createMember(page);
	await createFront(page, member);
});

test("create then delete member", async ({ page }) => {
	await registerAndLoginUser(page);
	const member = await createMember(page);
	await createFront(page, member);

	await page.goto("/members");
	await getMemberEntry(page, member).click();
	await page.locator("#settings-tab-button").click();
	await page.locator("#delete-member-button").click();
	await page.locator("#delete-member-confirm-button").click();
	await page.waitForURL("/members");

	await expect(getMemberEntry(page, member)).not.toBeVisible();

	await page.goto("/front");
	await expect(getMemberEntry(page, member)).not.toBeVisible();
	await expect(page.locator("#application-error-dialog")).not.toBeVisible();
});

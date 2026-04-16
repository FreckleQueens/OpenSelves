import { expect, test } from "@playwright/test";

import { createMember, getLogsCount, getMemberEntry, registerAndLoginUser } from "./utils";

test("create member", async ({ page }) => {
	await registerAndLoginUser(page);

	const pushRequest = page.waitForResponse(/\/sync\/push/);
	const member = await createMember(page);

	expect((await pushRequest).ok()).toBe(true);

	await expect(getMemberEntry(page, member)).toHaveCount(1);
});

test("update member no change", async ({ page }) => {
	await registerAndLoginUser(page);
	const member = await createMember(page);

	const previousLogsCount = await getLogsCount(page);
	await getMemberEntry(page, member).locator(".member-card").click();
	await page.locator("#save-record-button").click();

	await page.waitForURL("/members");

	const newLogsCount = await getLogsCount(page);
	expect(newLogsCount).toBe(previousLogsCount);
});

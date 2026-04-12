import { expect, test } from "@playwright/test";

import { createMember, getLogsCount, registerAndLoginUser } from "./utils";

test("create member", async ({ page }) => {
	await registerAndLoginUser(page);

	const pushRequest = page.waitForResponse(/\/sync\/push/);
	const member = await createMember(page);

	expect((await pushRequest).ok()).toBe(true);

	const memberEntry = page.getByRole("link", { name: `${member.name} ${member.pronouns}` });
	await expect(memberEntry).toBeVisible();
});

test("update member no change", async ({ page }) => {
	await registerAndLoginUser(page);
	const member = await createMember(page);

	const previousLogsCount = await getLogsCount(page);
	await page.getByRole("link", { name: `${member.name} ${member.pronouns}` }).click();
	await page.locator("#save-member-button").click();

	await page.waitForURL("/members");

	const newLogsCount = await getLogsCount(page);
	expect(newLogsCount).toBe(previousLogsCount);
});

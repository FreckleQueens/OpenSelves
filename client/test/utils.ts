import { createId } from "@paralleldrive/cuid2";
import { expect } from "@playwright/test";
import type { Page } from "playwright";

export async function expectNoAppError(page: Page) {
	return expect(page.locator("#application-error-dialog")).not.toHaveClass("has-errors");
}

export async function registerAndLoginUser(
	page: Page,
): Promise<{ email: string; password: string }> {
	const email = createId() + "@example.com";
	const password = "12345678";

	await page.goto("/auth");

	await page.getByRole("button", { name: "Register" }).click();

	const form = page.locator("form.register");
	await form.locator("input[name=email]").fill(email);
	await form.locator("input[name=password]").fill(password);
	await form.locator('input[name="registrationPassword"]').fill("12345678");
	await form.getByRole("button", { name: "Register" }).click();
	await page.locator("#auto-login-button").click();

	await page.waitForURL("/main");

	return {
		email,
		password,
	};
}

export async function createMember(page: Page) {
	const member = {
		name: createId(),
		pronouns: "pro/nouns",
		description: "a description",
	};
	await page.goto("/members");
	await page.locator("#open-fab-menu-button").click();
	await page.locator("#create-member-button").click();

	await page.locator('input[name="name"]').fill(member.name);
	await page.locator('input[name="pronouns"]').fill(member.pronouns);
	await page.locator('textarea[name="description"]').fill(member.description);

	await page.locator("#save-member-button").click();
	await page.waitForURL("/members");

	return member;
}

export async function getLogsCount(page: Page) {
	return await page.evaluate(async () => {
		const storage = await window.openselves.Storage.getStorage();
		const userId = storage.getKey();
		const idb = await window.openselves.IDB.getClient();
		return (await idb.log.getAll(userId)).length;
	});
}

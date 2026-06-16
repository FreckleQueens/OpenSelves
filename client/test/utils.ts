import { createId } from "@paralleldrive/cuid2";
import { type Locator, expect } from "@playwright/test";
import assert from "node:assert";
import type { Page } from "playwright";

export const getMemberEntry = (root: Page | Locator, member: { name: string }) =>
	root.locator(`.member-entry[data-name=${member.name}]`);

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

	await page.waitForURL("/front");

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

	await page.locator("#save-record-button").click();
	await page.waitForURL("/members");

	return member;
}

export async function getLogsCount(page: Page) {
	return await page.evaluate(async () => {
		const storage = window.openselves.PersistentStorage.getInstance();
		const userId = storage.getUserId();
		const idb = window.openselves.IDB.getInstance();
		return (await idb.log.getByField("userId", userId)).length;
	});
}

export async function gotoLastEmailLink(page: Page): Promise<void> {
	const fetchUrl = "http://localhost:8025/view/latest.txt";
	const response = await fetch(fetchUrl);

	if (!response) {
		throw new Error("No response from fetch " + fetchUrl);
	}

	if (!response.ok) {
		throw new Error("Fetch returned non ok status " + response.status, { cause: response });
	}

	let body: string;
	try {
		body = await response.text();
	} catch {
		throw new Error("Couldn't parse response body as text", { cause: response });
	}

	const lines = body.split("\n");
	const verificationLink = lines.find((line) => line.startsWith("http"));
	assert(verificationLink);

	const gotoResponse = await page.goto(verificationLink);
	assert(gotoResponse);
	assert(gotoResponse.ok());
}

export async function logout(page: Page) {
	if (!page.url().endsWith("/account")) {
		await page.goto("/account");
	}

	await page.locator("#logout-button").click();
	await page.locator("#logout-wipe-data-button").click();
	await page.waitForURL("/land");
}

export async function verifyEmail(page: Page) {
	if (!page.url().endsWith("/account")) {
		await page.goto("/account");
	}

	await page.waitForSelector("#email-status.ready.unverified");

	await gotoLastEmailLink(page);
	await page.locator("#success-continue-button").click();
	await page.waitForURL("/front");

	await page.goto("/account");
	await page.waitForSelector("#email-status.ready.verified");
}

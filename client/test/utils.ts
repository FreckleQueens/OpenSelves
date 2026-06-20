import { createId } from "@paralleldrive/cuid2";
import { type Locator, expect, test } from "@playwright/test";
import assert from "node:assert";
import type { Page } from "playwright";

export const getMemberEntry = (root: Page | Locator, member: { name: string }) =>
	root.locator(`.member-entry[data-name=${member.name}]`);

export async function expectNoAppError(page: Page) {
	return expect(page.locator("#application-error-dialog")).not.toHaveClass("has-errors");
}

export async function registerAndLoginUser(page: Page, persistSession: boolean = false) {
	const email = createId() + "@example.com";
	const password = "12345678";

	await page.goto("/auth");

	await page.getByRole("button", { name: "Register" }).click();

	const form = page.locator("form.register");
	await form.locator("input[name=email]").fill(email);
	await form.locator("input[name=password]").fill(password);
	await form.locator('input[name="registrationPassword"]').fill("12345678");
	await form.getByRole("button", { name: "Register" }).click();
	await page.locator("#autofill-login-button").click();

	if (persistSession) {
		await page.locator("#persist-session-checkbox").click();
	}
	await page.locator("#login-button").click();

	await page.waitForURL("/front?user_logged_in=1");

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

async function fetchUrl(url: string, parseJson: boolean): Promise<object | string> {
	const response = await fetch(url);

	if (!response) {
		throw new Error(`No response from mailpit api for url ${url}`);
	}

	if (!response.ok) {
		throw new Error(`Fetch returned non ok status ${response.status} for url ${url}`, {
			cause: response,
		});
	}

	let body: unknown;
	if (parseJson) {
		try {
			body = await response.json();
		} catch {
			throw new Error(`Couldn't parse response body as json for url ${url}`, {
				cause: response,
			});
		}
	} else {
		body = await response.text();
	}
	assert(body);
	return body;
}

export async function getEmailLink(
	emailAddress: string,
	expectEmailCount: number = 1,
	useEmailIndex: number = 0,
) {
	const query = new URLSearchParams({
		query: `to:"${emailAddress}"`,
	});
	const searchUrl = `http://localhost:8025/api/v1/search?${query.toString()}`;

	const search = await fetchUrl(searchUrl, true);
	let messages = search["messages"];
	assert(messages);
	assert(Array.isArray(messages));
	assert.strictEqual(messages.length, expectEmailCount);
	messages = messages.sort((a, b) =>
		a["Created"] < b["Created"] ? -1 : a["Created"] > b["Created"] ? 1 : 0,
	);

	const messageId = messages[useEmailIndex]["ID"];
	const viewUrl = `http://localhost:8025/view/${messageId}.txt`;
	const body = await fetchUrl(viewUrl, false);
	assert(typeof body === "string");

	const lines = body.split("\n");
	const verificationLink = lines.find((line) => line.startsWith("http"));
	assert(verificationLink);
	return verificationLink;
}

export async function logout(page: Page) {
	if (!page.url().endsWith("/account")) {
		await page.goto("/account");
	}

	await page.locator("#logout-button").click();
	await page.locator("#logout-wipe-data-button").click();
	await page.waitForURL("/land?user_logged_out=1");
}

export async function verifyEmail(
	page: Page,
	email: string,
	expectEmailCount?: number,
	useEmailIndex?: number,
) {
	if (!page.url().endsWith("/account")) {
		await page.goto("/account");
	}

	await page.waitForSelector("#email-status.ready.unverified", {
		timeout: 3000,
	});

	const link = await getEmailLink(email, expectEmailCount, useEmailIndex);
	assert(link.indexOf("/verify-email/") >= 0);
	const gotoResponse = await page.goto(link);
	assert(gotoResponse);
	assert(gotoResponse.ok());
	await page.locator("#success-continue-button").click();
	await page.waitForURL("/front?verified_email=1");

	await page.goto("/account");
	await page.waitForSelector("#email-status.ready.verified", {
		timeout: 3000,
	});
}

export async function waitForRequest(page: Page, pathContains: string, expectOk?: boolean) {
	const response = await page.waitForResponse((response) => {
		return response.request().url().indexOf(pathContains) >= 0;
	});
	if (typeof expectOk === "boolean") {
		assert.strictEqual(response.ok(), expectOk);
	}
	return response;
}

export async function debugPromise(page: Page, promise: Promise<unknown>) {
	try {
		await promise;
	} catch (e) {
		console.error(e);
		console.error(await page.consoleMessages({ filter: "since-navigation" }));
		console.error(await page.pageErrors({ filter: "since-navigation" }));
		await page.screenshot({
			path: `test-results/failure-screenshot_${test.info().title.replaceAll(" ", "-")}.png`,
			fullPage: true,
		});
		throw e;
	}
}

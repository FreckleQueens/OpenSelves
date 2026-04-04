import { createId } from "@paralleldrive/cuid2";
import { expect, test } from "@playwright/test";
import type { BrowserContext, Cookie, Page } from "playwright";

const email = createId() + "@example.com";
let cookies: Array<Cookie> = [];
let key: string = "";
test("register", async ({ page }) => {
	await page.goto("/");

	await page.getByRole("button", { name: "Register" }).click();

	const form = page.locator("form.register");
	expect(form.getByRole("button", { name: "Register" }));
	await form.locator("input[name=email]").fill(email);
	await form.locator("input[name=password]").fill("12345678");
	await form.locator('input[name="registrationPassword"]').fill("12345678");
	await form.getByRole("button", { name: "Register" }).click();
	await page.getByRole("button", { name: "Login" }).nth(1).click();

	await page.waitForURL("/main");
});

test("login", async ({ page, context }) => {
	await page.goto("/");

	const form = page.locator("form.login");
	await form.locator("input[name=email]").fill(email);
	await form.locator("input[name=password]").fill("12345678");
	await form.getByRole("button", { name: "Login" }).click();

	await page.waitForURL("/main");
	cookies = await context.cookies();
	key = await page.evaluate(async () => (await window.openselves.Storage.getStorage()).getKey());
	expect(key).toBeDefined();
});

async function login(page: Page, context: BrowserContext) {
	await context.addCookies(cookies);
	await page.waitForFunction(() => !!window.openselves);
	await page.evaluate(async (key) => {
		(await window.openselves.Storage.getStorage()).setKey(key);
		window.openselves.SyncWorker.getInstance().resume();
	}, key);
}
test("create member", async ({ page, context }) => {
	await page.goto("/members");
	await login(page, context);
	await page.getByRole("button").nth(1).click();

	await page.locator('input[name="name"]').fill("Alice");
	await page.locator('input[name="pronouns"]').fill("she/her");
	await page.locator('textarea[name="description"]').fill("a member of our& system");

	const pushRequest = page.waitForResponse(/\/sync\/push/);
	await page.getByRole("link").nth(2).click();

	expect((await pushRequest).ok()).toBe(true);

	await page.waitForURL("/members");
	const memberEntry = page.getByRole("link", { name: "Alice she/her" });
	await expect(memberEntry).toBeVisible();
});

test("update member no change", async ({ page, context }) => {
	await page.goto("/members");
	await login(page, context);
	await page.getByRole("link", { name: "Alice she/her" }).click();
	await page.getByRole("link").nth(1).click();

	await page.waitForURL("/members");

	const logsCount = await page.evaluate(async (key) => {
		return (await (await window.openselves.IDB.getClient()).log.getAll(key)).length;
	}, key);
	expect(logsCount).toBe(0);
});

import { test } from "@playwright/test";

test("land page", async ({ page }) => {
	await page.goto("/");
	await page.waitForURL("/land?from_index_page=1");

	await page.locator("select[name=language]").selectOption("fr");
	await page.locator("#continue-button").click();
	await page.waitForURL("/auth?landed=1");
});

test("change lang", async ({ page }) => {
	await page.goto("/auth");

	await page.locator("#settings-link").click();
	await page.locator("select[name=language]").selectOption("fr");
	await page.locator("#back-link").click();
	await page.locator("#settings-link").click();
	await page.locator("select[name=language]").selectOption("en");
	await page.locator("#back-link").click();
	await page.locator("#settings-link").click();
});

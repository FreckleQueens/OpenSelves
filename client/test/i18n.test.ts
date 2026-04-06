import { test } from "@playwright/test";

test("change lang", async ({ page }) => {
	await page.goto("/");

	await page.locator("select[name=language]").selectOption("fr");
	await page.locator("select[name=language]").selectOption("en");
});

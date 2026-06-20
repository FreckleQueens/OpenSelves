import { test } from "@playwright/test";
import assert from "node:assert";

import { registerAndLoginUser } from "./utils";

test("short lived session logs out", async ({ page }) => {
	await registerAndLoginUser(page);
	await page.goto("about:blank");
	// Wait the configured REFRESH_TOKEN_SHORT_DURATION (see playwright.config.ts)
	await page.waitForTimeout(10000);
	await page.goto("/account");
	await page.waitForTimeout(3000);
	assert(page.url().endsWith("/land"));
});

test("long lived session doesn't log out", async ({ page }) => {
	await registerAndLoginUser(page, true);
	await page.goto("about:blank");
	// Wait the configured REFRESH_TOKEN_SHORT_DURATION (see playwright.config.ts)
	await page.waitForTimeout(10000);
	await page.goto("/account");
	await page.waitForTimeout(3000);
	assert(page.url().endsWith("/account"));
});

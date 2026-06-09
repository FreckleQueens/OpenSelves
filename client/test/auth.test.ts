import { createId } from "@paralleldrive/cuid2";
import { expect, test } from "@playwright/test";

import { registerAndLoginUser } from "./utils";

test("register", async ({ page }) => {
	await page.goto("/auth");

	await page.getByRole("button", { name: "Register" }).click();

	const form = page.locator("form.register");
	expect(form.getByRole("button", { name: "Register" }));
	const email = createId() + "@example.com";
	await form.locator("input[name=email]").fill(email);
	await form.locator("input[name=password]").fill("12345678");
	await form.locator('input[name="registrationPassword"]').fill("12345678");
	await form.locator('.altcha input[type="checkbox"] + svg').click();
	await form.locator(".altcha[data-state='verified']").waitFor();
	await form.getByRole("button", { name: "Register" }).click();
	await page.locator("#auto-login-button").click();

	await page.waitForURL("/front");
	await page.goto("/account");
	await expect(page.locator("body")).toContainText(email);
});

test("login", async ({ page }) => {
	const user = await registerAndLoginUser(page);
	await page.goto("/account");
	await page.locator("#logout-button").click();
	await page.locator("#logout-wipe-data-button").click();
	await page.waitForURL("/land");

	await page.goto("/auth");

	const form = page.locator("form.login");
	await form.locator("input[name=email]").fill(user.email);
	await form.locator("input[name=password]").fill(user.password);
	await form.locator('.altcha input[type="checkbox"] + svg').click();
	await page.waitForSelector(".altcha[data-state='verified']");
	await form.getByRole("button", { name: "Login" }).click();

	await page.waitForURL("/front");
	await page.goto("/account");
	await expect(page.locator("body")).toContainText(user.email);
});

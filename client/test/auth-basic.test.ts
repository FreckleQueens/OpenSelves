import { createId } from "@paralleldrive/cuid2";
import { expect, test } from "@playwright/test";

import { expectNoAppError, logout, registerAndLoginUser } from "./utils";

test("register", async ({ page }) => {
	await page.goto("/auth");

	await page.getByRole("button", { name: "Register" }).click();

	const form = page.locator("form.register");
	expect(form.getByRole("button", { name: "Register" }));
	const email = createId() + "@example.com";
	await form.locator("input[name=email]").fill(email);
	await form.locator("input[name=password]").fill("12345678");
	await form.locator('input[name="registrationPassword"]').fill("12345678");
	await form.getByRole("button", { name: "Register" }).click();
	await page.locator("#autofill-login-button").click();

	await page.locator("#login-button").click();

	await page.waitForURL("/front");
	await page.goto("/account");
	await expect(page.locator("body")).toContainText(email);
});

test("login", async ({ page }) => {
	const user = await registerAndLoginUser(page);
	await logout(page);

	await page.goto("/auth");

	const form = page.locator("form.login");
	await form.locator("input[name=email]").fill(user.email);
	await form.locator("input[name=password]").fill(user.password);
	await form.getByRole("button", { name: "Login" }).click();

	await page.waitForURL("/front");
	await page.goto("/account");
	await expect(page.locator("body")).toContainText(user.email);
});

test("change password", async ({ page }) => {
	const user = await registerAndLoginUser(page);
	await page.goto("/account");
	await page.locator("[href='/account/change-password']").click();
	await page.waitForURL("/account/change-password");

	const newPassword = createId();

	await page.locator("input[name=oldPassword]").fill("wrong password");
	await page.locator("input[name=newPassword]").fill(newPassword);
	await page.locator("#change-password-button").click();
	await page.waitForSelector(".form-global-error");
	await expectNoAppError(page);

	await page.locator("input[name=oldPassword]").fill(user.password);
	await page.locator("#change-password-button").click();
	await page.locator("#success-dialog-continue-button").click();
	await page.waitForURL("/account");
	await expectNoAppError(page);

	await logout(page);

	await page.goto("/auth");
	await page.locator("input[name=email]").fill(user.email);
	await page.locator("input[name=password]").fill(newPassword);
	await page.locator("#login-button").click();
	await page.waitForURL("/front");

	await page.goto("/account/change-password");
	await page.locator("input[name=oldPassword]").fill(newPassword);
	await page.locator("input[name=newPassword]").fill(user.password);
	await page.locator("#change-password-button").click();
	await page.locator("#success-dialog-continue-button").click();
	await page.waitForURL("/account");

	await expectNoAppError(page);
});

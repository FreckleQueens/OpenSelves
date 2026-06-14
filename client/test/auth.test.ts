import { createId } from "@paralleldrive/cuid2";
import { expect, test } from "@playwright/test";
import assert from "node:assert";

import {
	expectNoAppError,
	gotoLastEmailLink,
	logout,
	registerAndLoginUser,
	verifyEmail,
} from "./utils";

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
	await page.locator("#auto-login-button").click();

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

test("verify email", async ({ page }) => {
	await registerAndLoginUser(page);
	await verifyEmail(page);
});

test("resend verification email", async ({ page }) => {
	await registerAndLoginUser(page);
	await page.goto("/account");
	await page.waitForSelector(".resend-verification-email-comp");
	await page.locator("#resend-verification-email-button").click();
	await page.waitForSelector("#resend-verification-email-button", {
		state: "hidden",
	});
	assert(await page.isVisible(".resend-verification-email-comp"));
	await expectNoAppError(page);

	await verifyEmail(page);
	assert(await page.isHidden("#resend-verification-email-button"));
	assert(await page.isHidden(".resend-verification-email-comp"));
	await expectNoAppError(page);
});

test("change email", async ({ page }) => {
	const user = await registerAndLoginUser(page);
	await page.goto("/account");
	await page.locator("[href='/account/change-email']").click();
	await page.waitForURL("/account/change-email");

	await page.locator("input[name=email]").fill(user.email);
	await page.locator("#change-email-button").click();
	await page.waitForSelector(".form-global-error");
	await expectNoAppError(page);

	await page.locator("input[name=email]").fill(createId() + "@example.com");
	await page.locator("#change-email-button").click();
	await page.locator("#success-dialog-continue-button").click();
	await page.waitForURL("/account");
	await expectNoAppError(page);

	await page.locator("[href='/account/change-email']").click();
	await page.waitForURL("/account/change-email");

	await page.locator("input[name=email]").fill(createId() + "@example.com");
	await page.locator("#change-email-button").click();
	await page.locator("#success-dialog-continue-button").click();
	await page.waitForURL("/account");

	await verifyEmail(page);

	await expectNoAppError(page);
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

test("recover password", async ({ page }) => {
	const user = await registerAndLoginUser(page);
	await logout(page);

	const wrongEmail = "wrongemail@example.com";
	await page.goto("/auth");
	await page.locator("input[name=email]").fill(wrongEmail);
	const targetUrl = "/auth/recover-password?email=" + wrongEmail;
	await page.locator(`[href='${targetUrl}']`).click();

	await page.waitForURL(targetUrl);
	assert.strictEqual(await page.inputValue("input[name=email]"), wrongEmail);

	await page.locator("#recover-password-button").click();
	await page.waitForSelector(".form-global-error");

	await page.fill("input[name=email]", user.email);
	await page.locator("#recover-password-button").click();
	await page.locator("#success-dialog-continue-button").click();
	await page.waitForURL("/auth");

	const newPassword = createId();
	await gotoLastEmailLink(page);
	await page.fill("input[name=newPassword]", newPassword);
	await page.locator("#recover-password-button").click();
	await page.locator("#success-dialog-continue-button").click();

	await page.waitForURL("/auth");
	await page.fill("input[name=email]", user.email);
	await page.fill("input[name=password]", newPassword);
	await page.locator("#login-button").click();
	await page.waitForURL("/front");
});

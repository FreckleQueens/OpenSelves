import { createId } from "@paralleldrive/cuid2";
import { test } from "@playwright/test";
import assert from "node:assert";
import type { Response } from "playwright";

import {
	debugPromise,
	expectNoAppError,
	getEmailLink,
	logout,
	registerAndLoginUser,
	verifyEmail,
	waitForRequest,
} from "./utils";

test("verify email", async ({ page }) => {
	const { email } = await registerAndLoginUser(page);
	await verifyEmail(page, email);
});

test("resend verification email", async ({ page }) => {
	const { email } = await registerAndLoginUser(page);
	await page.goto("/account");
	await page.waitForSelector(".resend-verification-email-comp", {
		timeout: 3000,
	});
	await page.locator("#resend-verification-email-button").click();
	await page
		.locator("span", {
			hasText: "Verification email sent.",
		})
		.waitFor({
			timeout: 5000,
		});
	assert(await page.locator("#resend-verification-email-button[disabled]").isVisible());
	assert(await page.isVisible(".resend-verification-email-comp"));
	await expectNoAppError(page);

	await verifyEmail(page, email, 2, 1);
	assert(await page.isHidden("#resend-verification-email-button"));
	assert(
		await page
			.locator("span", {
				hasText: "Verification email sent.",
			})
			.isHidden(),
	);
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

	const newEmail = createId() + "@example.com";
	await page.locator("input[name=email]").fill(newEmail);
	await page.locator("#change-email-button").click();

	await page.locator("#success-dialog-continue-button").click({
		timeout: 5000,
	});
	await page.waitForURL("/account");

	await verifyEmail(page, newEmail);

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

	const link = await getEmailLink(user.email, 2, 1);
	assert(link.indexOf("/recover-password/") >= 0);
	const gotoResponse = await page.goto(link);
	assert(gotoResponse);
	assert(gotoResponse.ok());
	const newPassword = createId();
	await page.fill("input[name=newPassword]", newPassword);
	await page.locator("#recover-password-button").click();
	await page.locator("#success-dialog-continue-button").click();

	await page.waitForURL("/auth");
	await page.fill("input[name=email]", user.email);
	await page.fill("input[name=password]", newPassword);
	await page.locator("#login-button").click();
	await page.waitForURL("/front?user_logged_in=1");
});

test("send single form page with captcha and expired access token", async ({ page }) => {
	await registerAndLoginUser(page);
	await page.goto("/account");
	await page.locator("[href='/account/change-email']").click();
	await page.waitForURL("/account/change-email");

	await page.locator("input[name=email]").fill(createId() + "@example.com");
	let response: Response;
	do {
		response = await waitForRequest(page, "/sync/pull");
	} while (!response.ok());
	await page.evaluate(() => {
		window.openselves.SyncWorker.getInstance().pause();
	});
	// Wait for access token to expire (see playwright.config.ts)
	await page.waitForTimeout(4000);
	await page.locator("#change-email-button").click();
	await waitForRequest(page, "/user/", false);
	await waitForRequest(page, "/user/");

	await debugPromise(
		page,
		page.locator("#success-dialog-continue-button").click({
			timeout: 5000,
		}),
	);
	await page.waitForURL("/account");
	await expectNoAppError(page);
});

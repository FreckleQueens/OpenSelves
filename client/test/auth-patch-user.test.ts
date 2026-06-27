import { createId } from "@paralleldrive/cuid2";
import assert from "node:assert";
import test, { describe } from "node:test";
import type { HTTPResponse } from "puppeteer";

import { setupPuppeteer } from "./utils.js";

describe("Auth patch user", () => {
	const ctx = setupPuppeteer();

	test("verify email", async () => {
		const { email } = await ctx.registerAndLoginUser();
		await ctx.verifyEmail(email);
	});

	test("resend verification email", async () => {
		const { email } = await ctx.registerAndLoginUser();
		await ctx.goto("/account");
		await ctx.locator(".resend-verification-email-comp").setTimeout(3000).wait();
		await ctx.locator("#resend-verification-email-button").click();
		await ctx
			.locator("form:has(#resend-verification-email-button) + span")
			.filter((el) => el.textContent.includes("Verification email sent."))
			.setTimeout(5000)
			.wait();
		await ctx.locator("#resend-verification-email-button[disabled]").wait();
		await ctx.locator(".resend-verification-email-comp").wait();
		await ctx.expectNoAppError();

		await ctx.verifyEmail(email, 2, 1);
		assert.strictEqual(await ctx.page.$("#resend-verification-email-button"), null);
		assert.strictEqual(await ctx.page.$(".resend-verification-email-comp"), null);

		await ctx.expectNoAppError();
	});

	test("change email", async () => {
		const user = await ctx.registerAndLoginUser();
		await ctx.goto("/account");
		await ctx.locator("[href='/account/change-email']").click();
		await ctx.waitForNavigation("/account/change-email");

		await ctx.locator("input[name=email]").fill(user.email);
		await ctx.locator("#change-email-button").click();
		await ctx.locator(".form-global-error").wait();
		await ctx.expectNoAppError();

		await ctx.locator("input[name=email]").fill(createId() + "@example.com");
		await ctx.locator("#change-email-button").click();
		await ctx.clickOnOpeningDialogButtonWithId("success-dialog-continue-button");
		await ctx.waitForNavigation("/account");
		await ctx.expectNoAppError();

		await ctx.locator("[href='/account/change-email']").click();
		await ctx.waitForNavigation("/account/change-email");

		const newEmail = createId() + "@example.com";
		await ctx.locator("input[name=email]").fill(newEmail);
		await ctx.locator("#change-email-button").click();

		await ctx.clickOnOpeningDialogButtonWithId("success-dialog-continue-button");
		await ctx.waitForNavigation("/account");

		await ctx.verifyEmail(newEmail);

		await ctx.expectNoAppError();
	});

	test("recover password", async () => {
		const user = await ctx.registerAndLoginUser();
		await ctx.logout();

		const wrongEmail = "wrongemail@example.com";
		await ctx.goto("/auth");
		await ctx.locator("input[name=email]").fill(wrongEmail);
		const targetUrl = "/auth/recover-password?email=" + wrongEmail;
		await ctx.locator(`[href='${targetUrl}']`).click();

		await ctx.waitForNavigation(targetUrl);
		assert.strictEqual(await ctx.page.$eval("input[name=email]", (el) => el.value), wrongEmail);

		await ctx.locator("#recover-password-button").click();
		await ctx.locator(".form-global-error").wait();

		await ctx.locator("input[name=email]").fill(user.email);
		await ctx.locator("#recover-password-button").click();
		await ctx.clickOnOpeningDialogButtonWithId("success-dialog-continue-button");
		await ctx.waitForNavigation("/auth");

		const link = await ctx.getEmailLink(user.email, 2, 1);
		assert(link.indexOf("/recover-password/") >= 0);
		const gotoResponse = await ctx.goto(link);
		assert(gotoResponse);
		assert(gotoResponse.ok());
		const newPassword = createId();
		await ctx.locator("input[name=newPassword]").fill(newPassword);
		await ctx.locator("#recover-password-button").click();
		await ctx.clickOnOpeningDialogButtonWithId("success-dialog-continue-button");

		await ctx.waitForNavigation("/auth");
		await ctx.locator("input[name=email]").fill(user.email);
		await ctx.locator("input[name=password]").fill(newPassword);
		await ctx.locator("#login-button").click();
		await ctx.waitForNavigation("/dashboard?user_logged_in=1");
	});

	test("send single form page with captcha and expired access token", async () => {
		await ctx.registerAndLoginUser();
		await ctx.goto("/account");
		await ctx.locator("[href='/account/change-email']").click();
		await ctx.waitForNavigation("/account/change-email");

		await ctx.locator("input[name=email]").fill(createId() + "@example.com");
		let response: HTTPResponse;
		do {
			response = await ctx.waitForResponse("/sync/pull");
		} while (!response.ok());
		await ctx.page.evaluate(() => {
			window.openselves.SyncWorker.getInstance().pause();
		});
		// Wait for access token to expire (see package.json)
		await ctx.waitForTimeout(4000);
		await ctx.locator("#change-email-button").click();
		await ctx.waitForResponse("/user/", false);
		await ctx.waitForResponse("/user/");

		await ctx.clickOnOpeningDialogButtonWithId("success-dialog-continue-button", 5000);
		await ctx.waitForNavigation("/account");
		await ctx.expectNoAppError();
	});
});

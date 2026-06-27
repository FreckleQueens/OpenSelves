import { createId } from "@paralleldrive/cuid2";
import test, { describe } from "node:test";

import { setupPuppeteer } from "./utils.js";

describe("Auth basic", () => {
	const ctx = setupPuppeteer();

	test("register", async () => {
		await ctx.goto("/auth");

		await ctx
			.locator(".k-segmented button:nth-child(2)")
			.filter((el) => el.textContent.trim() === "Register")
			.click({
				debugHighlight: true,
			});

		const form = ctx.within("form.register");
		const submitButton = form
			.locator("button")
			.filter((el) => el.textContent.trim() === "Register");
		await submitButton.wait();
		const email = createId() + "@example.com";
		await form.locator("input[name=email]").fill(email);
		await form.locator("input[name=password]").fill("12345678");
		await form.locator('input[name="registrationPassword"]').fill("12345678");
		await submitButton.click();

		await ctx.clickOnOpeningDialogButtonWithId("autofill-login-button");

		await ctx.locator("#login-button").click();

		await ctx.waitForNavigation("/dashboard?user_logged_in=1");
		await ctx.goto("/account");
		await ctx
			.locator("body")
			// @ts-expect-error this is authorized
			.filter(`el => el.innerHTML.indexOf(${JSON.stringify(email)}) >= 0`)
			.wait();
	});

	test("login", async () => {
		const user = await ctx.registerAndLoginUser();
		await ctx.logout();

		await ctx.goto("/auth");

		const form = ctx.within("form.login");
		await form.locator("input[name=email]").fill(user.email);
		await form.locator("input[name=password]").fill(user.password);
		await form
			.locator("button")
			.filter((el) => el.textContent.trim() === "Login")
			.click();

		await ctx.waitForNavigation("/dashboard?user_logged_in=1");
		await ctx.goto("/account");
		await ctx
			.locator("body")
			// @ts-expect-error this is authorized
			.filter(`el => el.innerHTML.indexOf(${JSON.stringify(user.email)}) >= 0`)
			.wait();
	});

	test("change password", async () => {
		const user = await ctx.registerAndLoginUser();
		await ctx.goto("/account");
		await ctx.locator("[href='/account/change-password']").click();
		await ctx.waitForNavigation("/account/change-password");

		const newPassword = createId();

		await ctx.locator("input[name=oldPassword]").fill("wrong password");
		await ctx.locator("input[name=newPassword]").fill(newPassword);
		await ctx.locator("#change-password-button").click();
		await ctx.locator(".form-global-error").wait();
		await ctx.expectNoAppError();

		await ctx.locator("input[name=oldPassword]").fill(user.password);
		await ctx.locator("#change-password-button").click();
		await ctx.clickOnOpeningDialogButtonWithId("success-dialog-continue-button");
		await ctx.waitForNavigation("/account");
		await ctx.expectNoAppError();

		await ctx.logout();

		await ctx.goto("/auth");
		await ctx.locator("input[name=email]").fill(user.email);
		await ctx.locator("input[name=password]").fill(newPassword);
		await ctx.locator("#login-button").click();
		await ctx.waitForNavigation("/dashboard?user_logged_in=1");

		await ctx.goto("/account/change-password");
		await ctx.locator("input[name=oldPassword]").fill(newPassword);
		await ctx.locator("input[name=newPassword]").fill(user.password);
		await ctx.locator("#change-password-button").click();
		await ctx.clickOnOpeningDialogButtonWithId("success-dialog-continue-button");
		await ctx.waitForNavigation("/account");

		await ctx.expectNoAppError();
	});
});

import * as fs from "node:fs";
import { createId } from "@paralleldrive/cuid2";
import assert from "node:assert";
import path from "node:path";
import { type TestContext, before, beforeEach } from "node:test";
import puppeteer, {
	type Browser,
	type ConsoleMessageLocation,
	type HTTPResponse,
	type LaunchOptions,
	type Locator,
	type NodeFor,
	type Page,
} from "puppeteer";

const TEST_FAILURE_DIR = "./test-results";

let debugLaunchOptions: LaunchOptions | undefined;
if (process.execArgv.find((arg) => arg === "--test-only")) {
	debugLaunchOptions = {
		headless: false,
		slowMo: 100,
	};
}

export function setupPuppeteer() {
	const puppeteerContext: PuppeteerContext = new PuppeteerContext();

	before(() => {
		if (!fs.existsSync(TEST_FAILURE_DIR)) {
			fs.mkdirSync(TEST_FAILURE_DIR);
		} else {
			const stats = fs.statSync(TEST_FAILURE_DIR);
			if (stats.isFile()) {
				throw new Error(TEST_FAILURE_DIR + " is a file! It needs to be a directory.");
			}
		}
	});

	beforeEach(async (ctx) => {
		await puppeteerContext.prepareTest(ctx as TestContext);
	});

	return puppeteerContext;
}

export class PuppeteerContext {
	private _browser?: Browser;
	private _page?: Page;
	private _ctx?: TestContext;
	private logs: {
		type: "log" | "response" | "error" | "request_failure" | "test_log" | "goto";
		content: { toString(): string }[];
		trace?: ConsoleMessageLocation[];
	}[] = [];

	public get browser(): Browser {
		if (!this._browser) {
			throw new Error("browser not set");
		}
		return this._browser;
	}

	public set browser(browser: Browser) {
		this._browser = browser;
	}

	public get page(): Page {
		if (!this._page) {
			throw new Error("page not set");
		}
		return this._page;
	}

	public set page(page: Page) {
		this._page = page;

		page.on("console", (msg) => {
			this.logs.push({
				type: "log",
				content: [msg.type() + ":", msg.text()],
				trace: msg.stackTrace(),
			});
		});
		page.on("pageerror", (error) => {
			this.logs.push({
				type: "error",
				content: [error || ""],
			});
		});
		page.on("response", (response) => {
			const url = response
				.url()
				.replace("http://127.0.0.1:4173", "(client)")
				.replace("http://127.0.0.1:3000", "(api)");
			this.logs.push({
				type: "response",
				content: [response.request().method(), url, "-", response.status()],
			});
		});
		page.on("requestfailed", (request) => {
			this.logs.push({
				type: "request_failure",
				content: [request.url(), "-", request.failure()?.errorText || ""],
			});
		});
	}

	public get ctx(): TestContext {
		if (!this._ctx) {
			throw new Error("test context is missing");
		}
		return this._ctx;
	}

	public async prepareTest(ctx: TestContext) {
		this.logs = [];
		this._ctx = ctx;

		try {
			this.browser = await puppeteer.launch(debugLaunchOptions);

			const pages = await this.browser.pages();
			const page = pages[0];
			await ctx.waitFor(
				async () => {
					await page.goto("http://127.0.0.1:4173");
				},
				{
					timeout: 5000,
				},
			);
			await ctx.waitFor(
				async () => {
					await page.goto("http://127.0.0.1:3000");
				},
				{
					timeout: 5000,
				},
			);
			await page.goto("about:blank");

			this.page = page;
		} catch (e) {
			console.error("Error while executing test's before():");
			console.error(e);
			if (this.browser) {
				try {
					await this.browser.close();
				} catch (e2) {
					throw [e, e2];
				}
			}
			throw e;
		}

		ctx.after(async () => {
			try {
				if (ctx.error) {
					console.error("Test", ctx.fullName, "failed, writing log to output...");
					for (const log of this.logs) {
						console.log(
							log.type === "log" ? "" : log.type.toUpperCase() + ":",
							...log.content,
						);
						if (log.trace && log.content[0]?.toString().startsWith("error")) {
							console.log(log.trace);
						}
					}

					console.log("Last url was:", this.page.url());

					const testSlug = ctx.fullName
						.replaceAll(/[^a-zA-Z0-9._-]/g, "-")
						.replaceAll(/-+/g, "-");
					const screenshotPath = path.resolve(
						TEST_FAILURE_DIR,
						`${Date.now()}_${testSlug}.png`,
					);
					console.log("Saving screenshot to", screenshotPath, "...");
					await this.page.screenshot({
						path: screenshotPath,
						fullPage: true,
					});

					if (debugLaunchOptions) {
						await new Promise((resolve) => setTimeout(resolve, 25000));
					}
				}
			} catch (e) {
				console.error("Error while logging test's post-failure data:");
				console.error(e);
			}

			try {
				await this.browser.close();
			} catch (e) {
				console.error("Error while closing browser post-test:");
				console.error(e);
				throw e;
			}
		});
	}

	public log(...message: { toString(): string }[]) {
		this.logs.push({
			type: "test_log",
			content: message,
		});
	}

	public async goto(
		url: string,
		skipIfAlreadyThere: boolean = false,
		waitForSvelteMounted: boolean = false,
	) {
		let response: HTTPResponse | null | undefined;
		if (!skipIfAlreadyThere || this.page.url() !== url) {
			const fullUrl =
				url.startsWith("http") || url === "about:blank"
					? url
					: "http://127.0.0.1:4173" + url;
			this.logs.push({
				type: "goto",
				content: [fullUrl],
			});
			response = await this.page.goto(fullUrl);
		}
		if (waitForSvelteMounted && (skipIfAlreadyThere || response)) {
			await this.waitForSvelteMounted();
		}
		return response;
	}

	public async waitForNavigation(
		url: string | RegExp,
		timeout: number = 5000,
		waitForSvelteMounted: boolean = false,
	) {
		await this.page.waitForNavigation({
			timeout,
		});
		const compareExpr = "window.location.pathname + window.location.search";
		const pageFunction =
			typeof url === "string"
				? `${compareExpr} === ${JSON.stringify(url)}`
				: `${url.toString()}.test(${compareExpr})`;
		await this.page.waitForFunction(pageFunction, {
			timeout,
		});
		if (waitForSvelteMounted) {
			await this.waitForSvelteMounted(timeout);
		}
	}

	public async waitForSvelteMounted(timeout: number = 5000) {
		await this.locator(".layout-mounted").setTimeout(timeout).wait();
	}

	public async waitForTimeout(delay: number) {
		await new Promise<void>((resolve) => setTimeout(resolve, delay));
	}

	public locator<Selector extends string>(selector: Selector): Locator<NodeFor<Selector>> {
		return this.page.locator(selector);
	}

	public within<Prefix extends string>(
		prefix: Prefix,
	): {
		selector: Prefix;
		locator<Selector extends string>(
			selector: Selector,
		): Locator<NodeFor<`${Prefix} ${Selector}`>>;
	} {
		return {
			selector: prefix,
			locator: <Selector extends string>(selector: Selector) => {
				return this.page.locator(`${prefix} ${selector}`);
			},
		};
	}

	public async waitForResponse(
		pathContains: string,
		expectOk?: boolean,
		excludePreflight: boolean = true,
	) {
		const response = await this.page.waitForResponse((response) => {
			return (
				response.request().url().includes(pathContains) &&
				(!excludePreflight || response.request().method() !== "OPTIONS")
			);
		});
		if (typeof expectOk === "boolean") {
			assert.strictEqual(response.ok(), expectOk);
		}
		return response;
	}

	public async tick() {
		await this.page.evaluate(async () => {
			await window.openselves.tick();
		});
	}

	public async waitForTransition(selector: string, timeout: number = 5000) {
		await this.page.locator(selector).setTimeout(5000).wait();
		await Promise.race<void>([
			this.page.$eval(selector, async (el) => {
				if (!el) {
					throw new Error("dialog not found");
				}
				await new Promise<void>((resolve) => {
					el.addEventListener(
						"transitionend",
						() => {
							resolve();
						},
						{
							once: true,
						},
					);
				});
			}),
			new Promise((resolve) => setTimeout(resolve, timeout)),
		]);
	}

	public async clickOnOpeningDialogButtonWithId(buttonId: string, timeout: number = 5000) {
		await this.waitForTransition(`.k-dialog:has(button#${buttonId})`, timeout);
		await this.locator(`.k-dialog button#${buttonId}`).setTimeout(timeout).click();
	}

	public getMemberEntrySelector(member: { name: string }) {
		return `.member-entry[data-name=${member.name}]`;
	}

	public async expectNoAppError() {
		assert(
			await this.page.evaluate(() => {
				const errorDialogEl = document.getElementById("application-error-dialog");
				return errorDialogEl && !errorDialogEl.classList.contains("has-errors");
			}),
		);
	}

	public async getLogsCount() {
		return await this.page.evaluate(async () => {
			const storage = window.openselves.PersistentStorage.getInstance();
			const userId = storage.getUserId();
			const idb = window.openselves.IDB.getInstance();
			return (await idb.log.getByField("userId", userId)).length;
		});
	}

	public async registerAndLoginUser(persistSession: boolean = false) {
		const email = createId() + "@example.com";
		const password = "12345678";

		await this.goto("/auth");

		await this.locator(".k-segmented button:nth-child(2)")
			.filter((el) => el.textContent.trim() === "Register")
			.click();

		const form = this.within("form.register");
		await form.locator("input[name=email]").fill(email);
		await form.locator("input[name=password]").fill(password);
		await form.locator('input[name="registrationPassword"]').fill("12345678");
		await form
			.locator("button")
			.filter((el) => el.textContent.trim() === "Register")
			.click();
		await this.clickOnOpeningDialogButtonWithId("autofill-login-button");

		if (persistSession) {
			await this.locator("#persist-session-checkbox").click();
		}
		await this.locator("#login-button").click();

		await this.waitForNavigation("/dashboard?user_logged_in=1");

		return {
			email,
			password,
		};
	}

	public async logout() {
		await this.goto("/account", true);

		await this.locator("#logout-button").click();
		await this.locator("#logout-wipe-data-button").click();
		await this.waitForNavigation("/land?user_logged_out=1");
	}

	public async verifyEmail(email: string, expectEmailCount?: number, useEmailIndex?: number) {
		await this.goto("/account", true);

		await this.page.waitForSelector("#email-status.ready.unverified", {
			timeout: 3000,
		});

		const link = await this.getEmailLink(email, expectEmailCount, useEmailIndex);
		assert(link.indexOf("/verify-email/") >= 0);
		const gotoResponse = await this.goto(link);
		assert(gotoResponse);
		assert(gotoResponse.ok());
		await this.clickOnOpeningDialogButtonWithId("success-continue-button");
		await this.waitForNavigation("/dashboard?verified_email=1");

		await this.goto("/account");
		await this.page.waitForSelector("#email-status.ready.verified", {
			timeout: 3000,
		});
	}

	public async createMember() {
		const member = {
			name: createId(),
			pronouns: "pro/nouns",
			description: "a description",
		};
		await this.goto("/members");
		await this.locator("#open-fab-menu-button").click();
		await this.locator("#create-member-button").click();

		await this.locator('input[name="name"]').fill(member.name);
		await this.locator('input[name="pronouns"]').fill(member.pronouns);
		await this.locator('textarea[name="description"]').fill(member.description);

		await this.locator("#save-record-button").click();
		await this.waitForNavigation("/members");

		return member;
	}

	public async getEmailLink(
		emailAddress: string,
		expectEmailCount: number = 1,
		useEmailIndex: number = 0,
		timeout: number = 5000,
	) {
		const query = new URLSearchParams({
			query: `to:"${emailAddress}"`,
		});
		const searchUrl = `http://localhost:8025/api/v1/search?${query.toString()}`;

		let messageId: string | undefined;
		await this.ctx.waitFor(
			async () => {
				const search = await fetchUrl(searchUrl, true);
				const messages = search["messages"];
				assert(messages);
				assert(Array.isArray(messages));
				assert.strictEqual(messages.length, expectEmailCount);

				const sortedMessages = messages.sort((a, b) =>
					a["Created"] < b["Created"] ? -1 : a["Created"] > b["Created"] ? 1 : 0,
				);
				messageId = sortedMessages[useEmailIndex]["ID"];
			},
			{
				timeout,
			},
		);

		assert(messageId);

		const viewUrl = `http://localhost:8025/view/${messageId}.txt`;
		const body = await fetchUrl(viewUrl, false);
		assert(typeof body === "string");

		const lines = body.split("\n");
		const verificationLink = lines.find((line) => line.startsWith("http"));
		assert(verificationLink);
		return verificationLink;
	}
}

async function fetchUrl(url: string, parseJson: boolean): Promise<object | string> {
	const response = await fetch(url);

	if (!response) {
		throw new Error(`No response from mailpit api for url ${url}`);
	}

	if (!response.ok) {
		throw new Error(`Fetch returned non ok status ${response.status} for url ${url}`, {
			cause: response,
		});
	}

	let body: unknown;
	if (parseJson) {
		try {
			body = await response.json();
		} catch {
			throw new Error(`Couldn't parse response body as json for url ${url}`, {
				cause: response,
			});
		}
	} else {
		body = await response.text();
	}
	assert(body);
	return body;
}

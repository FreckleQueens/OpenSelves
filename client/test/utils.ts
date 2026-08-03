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
				.replace("https://localhost:4173", "(client)")
				.replace("https://localhost:3000", "(api)");
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
			this.browser = await puppeteer.launch({
				...debugLaunchOptions,
				acceptInsecureCerts: true,
			});

			const pages = await this.browser.pages();
			const page = pages[0];
			await ctx.waitFor(
				async () => {
					await page.goto("https://localhost:4173", {
						timeout: 1000,
					});
				},
				{
					timeout: 10000,
				},
			);
			await ctx.waitFor(
				async () => {
					await page.goto("https://localhost:3000", {
						timeout: 1000,
					});
				},
				{
					timeout: 10000,
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
		waitForPageContent: boolean = true,
		expectOk: boolean = true,
	) {
		let response: HTTPResponse | null | undefined;
		if (!skipIfAlreadyThere || this.page.url() !== url) {
			const fullUrl =
				url.startsWith("http") || url === "about:blank"
					? url
					: "https://localhost:4173" + url;
			this.logs.push({
				type: "goto",
				content: [fullUrl],
			});
			response = await this.page.goto(fullUrl);
		}

		if (waitForPageContent) {
			await this.waitForPageContent();
		}

		if (response) {
			assert.strictEqual(response.ok(), expectOk);
		}

		return response;
	}

	public async waitForNavigation(url: string | RegExp, timeout: number = 5000) {
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
		await this.waitForPageContent(timeout);

		await this.page.evaluate(async () => {
			while (document.activeViewTransition) {
				try {
					await document.activeViewTransition.finished;
				} catch {
					// ignored
				}
			}
		});
	}

	public async waitForPageContent(timeout: number = 5000) {
		await this.locator(".app-page-content.ready").setTimeout(timeout).wait();
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
		if (typeof expectOk === "boolean" && response.ok() !== expectOk) {
			throw new Error("response.ok() is " + response.ok() + ", expected " + expectOk, {
				cause: response,
			});
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

	public async expectPageContains(content: string) {
		return await this.locator("body")
			// @ts-expect-error this is authorized
			.filter(`el => el.innerHTML.indexOf(${JSON.stringify(content)}) >= 0`)
			.wait();
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

	public async getEntriesCount() {
		return await this.page.evaluate(async () => {
			const profile = await window.openselves.Profile.getCurrentProfile();
			const idb = window.openselves.IDB.getInstance();
			return (
				await Promise.all(
					profile.ownSubspaces.map(
						async (subspace) =>
							await idb.entries.getByNamespaceIdSubspaceId(
								window.openselves.OPENSELVES_NAMESPACE_ID,
								subspace.subspaceId,
							),
					),
				)
			).flat().length;
		});
	}

	public async createProfileAndLogin() {
		await this.goto("/profiles");

		await this.locator("#create-profile-button").click();
		await this.waitForNavigation("/profiles/edit");

		const form = this.within(".app-page-content form");
		const saveButton = this.locator("#save-record-button");
		await saveButton.wait();
		const profileName = createId();
		await form.locator("input[name=name]").fill(profileName);
		await saveButton.click();

		await this.waitForNavigation("/profiles");
		await this.locator(".profile-card").wait();
		assert.strictEqual((await this.page.$$(".profile-card")).length, 1);
		await this.withinProfileCard(profileName).locator(".login-button").click();
		await this.waitForNavigation("/subspaces/create-own?logged_in=1");
		await this.locator("#download-recovery-file-button").click();
		await this.locator("#confirm-checkbox").click();
		await this.locator("#continue-button").click();

		await this.waitForNavigation("/dashboard?subspace_setup_finish=1");

		return profileName;
	}

	public withinProfileCard(profileName: string) {
		return this.within(`.profile-card[data-profile-name=${profileName}]`);
	}

	public async logout(keepData: boolean = true) {
		await this.goto("/profile", true);

		await this.locator("#logout-button").click();
		await this.locator(
			keepData ? "#logout-keep-data-button" : "#logout-wipe-data-button",
		).click();
		await this.waitForNavigation("/land?user_logged_out=1");
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

		await this.waitForNavigation(/^\/members\/[0-9a-f]{64}\/edit$/g);
		await this.locator('input[name="name"]').fill(member.name);
		await this.locator('input[name="pronouns"]').fill(member.pronouns);
		await this.locator('textarea[name="description"]').fill(member.description);

		await this.locator("#save-record-button").click();
		await this.waitForNavigation("/members");

		return member;
	}
}

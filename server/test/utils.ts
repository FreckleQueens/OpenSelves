import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test, TestingModule } from "@nestjs/testing";
import { type Challenge, type Solution, solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/argon2id";
import assert from "node:assert";
import { after, afterEach, before, beforeEach } from "node:test";
import { API_VERSION } from "openselves-common";
import { isValidSchemaStatic } from "openselves-common/schema";
import {
	ByteString,
	Ed25519,
	type Ed25519KeyPair,
	Ed25519Sk,
	UserPublicKey,
} from "openselves-common/willow";

import { challengeSchema } from "../src/captcha/captcha-type-helpers.js";
import { CaptchaService } from "../src/captcha/captcha.service.js";
import type { ConfigData } from "../src/config.data.js";
import { DB } from "../src/db/drizzle.js";
import { QueueService } from "../src/queue/queue.service.js";
import { TestQueryBuilder } from "./TestQueryBuilder.js";

export type Captcha = {
	challenge: Challenge;
	solution: Solution;
};

type BaseEnv = {
	db: DB;
	registrationPassword: string;
	get request(): TestQueryBuilder;
	get rawRequest(): TestQueryBuilder;
};
export type TestEnvUser = {
	cookies: string;
	keys: Ed25519KeyPair;
	password: string;
};
export type TestEnvUsers = {
	user1: TestEnvUser;
	user2: TestEnvUser;
};
export type TestEnv = {
	app: NestExpressApplication;
	urlBase: string;
	configService: ConfigService<ConfigData>;
} & BaseEnv;
export type TestEnvWithUsers = TestEnv & {
	users: TestEnvUsers;
	getAuthChallenge(user?: { keys: { publicKey: UserPublicKey } }): Promise<string>;
	getValidAuthLoginParameters(
		withCaptcha?: boolean,
		user?: { keys: Ed25519KeyPair },
	): Promise<{
		challenge: string;
		signature: string;
		captcha?: Captcha;
	}>;
};

async function waitForServerToComeOnline(urlBase: string) {
	let checkInterval: NodeJS.Timeout | undefined;
	let rejectTimeout: NodeJS.Timeout | undefined;
	try {
		await Promise.race([
			new Promise<void>((resolve, reject) => {
				checkInterval = setInterval(() => {
					(async () => {
						const response = await fetch(urlBase + "/");
						if (response.status === 406) {
							resolve();
						}
					})().catch(reject);
				}, 1000);
			}),
			new Promise(
				(resolve, reject) =>
					(rejectTimeout = setTimeout(
						() => reject(new Error("Server didn't start after 30s")),
						30000,
					)),
			),
		]);
	} finally {
		clearInterval(checkInterval);
		clearTimeout(rejectTimeout);
	}
}

export async function createAndLoginUser(env: BaseEnv): Promise<TestEnvUser> {
	const keys = await Ed25519.generateKey();
	const password = "12345678";
	const response = await env.request
		.post("/auth/login")
		.send(
			await getValidAuthLoginParameters(env, true, {
				keys,
			}),
		)
		.expect(200)
		.execute();
	const cookies = convertResponseCookiesToRequestCookies(response);
	return { cookies, keys: keys, password };
}

async function createUsers(env: BaseEnv): Promise<TestEnvUsers> {
	const user1 = await createAndLoginUser(env);
	const user2 = await createAndLoginUser(env);
	return { user1, user2 };
}
export function setupTestSuite(
	envCallback: (env: TestEnv) => Promise<void> | void,
	setCaptchaToEasyMode: boolean = true,
) {
	let env: TestEnv;

	before(async () => {
		const urlBase = setCaptchaToEasyMode ? "https://localhost:3000" : "https://localhost:3002";
		await waitForServerToComeOnline(urlBase);

		const { AppModule, configureApp } = await import("../src/app.module.js");
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		const app = moduleFixture.createNestApplication<NestExpressApplication>();
		configureApp(app);
		const configService: ConfigService<ConfigData> = app.get(ConfigService);
		const registrationPassword = configService.getOrThrow("REGISTRATION_PASSWORD", {
			infer: true,
		});
		await app.init();

		const createUsersEnv: BaseEnv = {
			db: app.get(DB),
			registrationPassword,
			get request() {
				return new TestQueryBuilder(urlBase)
					.randomXForwardedFor()
					.set("X-OpenSelves-Version", API_VERSION)
					.expectHeader("X-OpenSelves-Version", API_VERSION);
			},
			get rawRequest() {
				return new TestQueryBuilder(urlBase);
			},
		};

		env = {
			...createUsersEnv,
			get request() {
				return createUsersEnv.request;
			},
			get rawRequest() {
				return createUsersEnv.rawRequest;
			},
			app,
			configService,
			urlBase,
		};
		await envCallback(env);
	});

	after(async () => {
		await env?.app?.close();
	});
}

export function setupTestSuiteWithUsers(
	envCallback: (env: TestEnvWithUsers) => Promise<void> | void,
	setCaptchaToEasyMode: boolean = true,
	recreateUsersBeforeEach: boolean = false,
) {
	let env: TestEnvWithUsers;

	setupTestSuite(async (sourceEnv) => {
		const users = await createUsers(sourceEnv);
		env = {
			...sourceEnv,
			get request() {
				return sourceEnv.request;
			},
			get rawRequest() {
				return sourceEnv.rawRequest;
			},
			users,
			async getAuthChallenge(user = users.user1) {
				return await getAuthChallenge(sourceEnv, user);
			},
			async getValidAuthLoginParameters(withCaptcha = true, user = users.user1) {
				return await getValidAuthLoginParameters(sourceEnv, withCaptcha, user);
			},
		};
		await envCallback(env);
	}, setCaptchaToEasyMode);

	if (recreateUsersBeforeEach) {
		beforeEach(async () => {
			env.users = await createUsers(env);
		});
	}

	afterEach(async () => {
		const queueService = env.app.get(QueueService);
		await queueService.flushJobs();
		try {
			assert(queueService.isIdle());
			assert.strictEqual(queueService.getFailedJobs(), 0);
		} finally {
			queueService.resetFailedJobs();
		}
	});
}

async function getAuthChallenge(
	env: BaseEnv,
	user: {
		keys: {
			publicKey: UserPublicKey;
		};
	},
) {
	const response = await env.request
		.post("/auth/challenge")
		.send({
			userKey: user.keys.publicKey.toBase64(),
			captcha: await solveCaptcha(env),
		})
		.expect(200)
		.json();

	assert("challenge" in response.body);
	assert(typeof response.body.challenge === "string");

	return response.body.challenge;
}

async function getValidAuthLoginParameters(
	env: BaseEnv,
	withCaptcha: boolean,
	user: {
		keys: {
			publicKey: UserPublicKey;
			secretKey: Ed25519Sk;
		};
	},
) {
	const challenge = await getAuthChallenge(env, user);
	const output: { challenge: string; signature: string; captcha?: Captcha } = {
		challenge,
		signature: (
			await Ed25519.sign(user.keys.secretKey, ByteString.fromUtf8(challenge))
		).toBase64(),
	};
	if (withCaptcha) {
		const captcha = await solveCaptcha(env);
		assert(captcha);
		output.captcha = captcha;
	}
	return output;
}

export async function waitFor(timeInMs: number) {
	return new Promise((resolve) => setTimeout(resolve, timeInMs));
}

export function convertResponseCookiesToRequestCookies(response: {
	headers: Response["headers"];
}): string {
	if (!response.headers) {
		throw new Error("Response has no headers", { cause: response });
	}
	const responseCookies: string[] = response.headers.getSetCookie();
	return responseCookies.map((str) => str.split(";")[0]).join("; ");
}
export function extractCookie(cookieName: string, cookies: string) {
	if (!cookies) {
		throw new Error("undefined cookies");
	}

	const value = cookies
		.split(/; /)
		.map((str) => str.split("="))
		.find((entry) => entry[0] === cookieName)?.[1];

	if (!value) {
		throw new Error(`${cookieName} not found in cookies`, { cause: cookies });
	}
	return value;
}

export async function solveCaptcha(
	env: BaseEnv,
	action?: string,
	actionValue?: string,
	expectedCode: number = 200,
): Promise<Captcha | null> {
	const actionPathSuffix = action ? `/${action}/${actionValue}` : "";

	let response: { headers: Response["headers"]; body: object };
	try {
		response = await env.rawRequest
			.get("/captcha/challenge" + actionPathSuffix)
			.randomXForwardedFor()
			.expect(expectedCode)
			.json();
	} catch (e) {
		// eslint-disable-next-line @typescript-eslint/only-throw-error
		throw { ...(typeof e === "object" ? e : { e }), action, actionValue };
	}

	if (expectedCode !== 200) {
		return null;
	}

	const challenge = response.body;
	assert(isValidSchemaStatic(challengeSchema, challenge));
	const solution = await solveChallenge({
		challenge,
		deriveKey,
	});

	if (!solution) {
		throw new Error("No solution for captcha");
	}

	return {
		challenge: challenge,
		solution: solution,
	};
}

export function testCaptcha(
	getEnv: () => TestEnv,
	successCode: number,
	doTest: (testName: string, testCallback: () => Promise<void> | void) => void,
	callback: (
		captcha: Captcha | object | string | null | undefined,
		actionValue?: string,
	) => TestQueryBuilder,
	action?: string,
	getActionValue?: () => string,
	invalidActionValue?: string,
	isActionValueConstant: boolean = false,
) {
	let usedCaptcha: Captcha | null = null;
	const cases = [
		{
			test: `POST ${successCode} valid captcha`,
			status: successCode,
			captcha: async (actionValue?: string) =>
				(usedCaptcha = await solveCaptcha(getEnv(), action, actionValue)),
		},
		{
			test: `POST 401 already used captcha challenge`,
			status: 401,
			captcha: () => {
				assert.notStrictEqual(usedCaptcha, null);
				return usedCaptcha;
			},
		},
		{
			test: "POST 400 undefined captcha",
			status: 400,
			captcha: undefined,
		},
		{
			test: "POST 400 null captcha",
			status: 400,
			captcha: null,
		},
		{
			test: "POST 400 empty string captcha",
			status: 400,
			captcha: "",
		},
		{
			test: "POST 400 invalid captcha",
			status: 400,
			captcha: {
				challenge: {},
				solution: {},
			},
		},
		{
			test: "POST 400 no solution captcha",
			status: 400,
			captcha: async (actionValue?: string) => {
				const captcha = await solveCaptcha(getEnv(), action, actionValue);
				return { ...captcha, solution: {} };
			},
		},
		{
			test: "POST 401 expired captcha",
			status: 401,
			captcha: async (actionValue?: string) => {
				const env = getEnv();

				const initialChallengeTtl = env.configService.get("CAPTCHA_CHALLENGE_TTL_SECONDS");
				env.configService.set("CAPTCHA_CHALLENGE_TTL_SECONDS", -1);

				let email: string | undefined;
				if (action === "sendEmail") {
					if (!actionValue) {
						throw new Error("Missing actionValue");
					}
					email = actionValue;
				}
				const challenge = await env.app.get(CaptchaService).createChallenge(1, email);

				env.configService.set("CAPTCHA_CHALLENGE_TTL_SECONDS", initialChallengeTtl);

				const solution = await solveChallenge({
					challenge,
					deriveKey,
				});
				return {
					challenge,
					solution,
				};
			},
		},
	];

	if (action) {
		cases.push({
			test: "POST 400 missing captcha action",
			status: 400,
			captcha: async () => (usedCaptcha = await solveCaptcha(getEnv())),
		});
		cases.push({
			test: "POST 400 wrong captcha action",
			status: 400,
			captcha: async (actionValue?: string) =>
				(usedCaptcha = await solveCaptcha(getEnv(), "wrongAction", actionValue, 400)),
		});
		if (getActionValue) {
			cases.push({
				test: "POST 400 missing captcha actionValue",
				status: 400,
				captcha: async () =>
					(usedCaptcha = await solveCaptcha(getEnv(), action, undefined, 400)),
			});

			if (invalidActionValue) {
				cases.push({
					test: "POST 400 invalid captcha actionValue",
					status: 400,
					captcha: async () => {
						return (usedCaptcha = await solveCaptcha(
							getEnv(),
							action,
							invalidActionValue,
							400,
						));
					},
				});
			}

			if (!isActionValueConstant) {
				cases.push({
					test: "POST 400 wrong captcha actionValue",
					status: 400,
					captcha: async (expectedActionValue?: string) => {
						const wrongActionValue = getActionValue();
						assert.notStrictEqual(wrongActionValue, expectedActionValue);
						return (usedCaptcha = await solveCaptcha(
							getEnv(),
							action,
							wrongActionValue,
						));
					},
				});
			}
		}
	}

	for (const { test: testName, status, captcha: getCaptcha } of cases) {
		doTest(testName, async () => {
			const actionValue = getActionValue?.();

			let captcha: Captcha | object | string | null | undefined;
			if (typeof getCaptcha === "function") {
				captcha = await getCaptcha(actionValue);
			} else {
				captcha = getCaptcha;
			}
			await callback(captcha, actionValue).expect(status).execute();
		});
	}
}

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test, TestingModule } from "@nestjs/testing";
import { createId } from "@paralleldrive/cuid2";
import { type Challenge, type Solution, solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/argon2id";
import { inArray } from "drizzle-orm";
import methods from "methods";
import assert from "node:assert";
import { after, before, beforeEach } from "node:test";
import { API_VERSION } from "openselves-common";
import { type User, users } from "openselves-common/db";
import type { ValueFromArray } from "rxjs";
import request, { type Response } from "supertest";
import type TestAgent from "supertest/lib/agent.js";
import type { App } from "supertest/types.js";

import { CaptchaService } from "../src/captcha/captcha.service.js";
import type { ConfigData } from "../src/config.data.js";
import { DBClass, DbService } from "../src/db/db.service.js";
import type { DB } from "../src/db/drizzle.js";

export type Captcha = {
	challenge: Challenge;
	solution: Solution;
};

type CreateUsersEnv = {
	db: DB;
	registrationPassword: string;
	request: TestAgent;
};
export type TestEnvUsers = {
	userPassword: string;
	user: User;
	cookies: string;
	user2: User;
	cookies2: string;
};
export type TestEnv = {
	app: INestApplication<App>;
	configService: ConfigService<ConfigData>;
} & CreateUsersEnv;
export type TestEnvWithUsers = TestEnv & {
	users: TestEnvUsers;
};

async function createUsers(env: CreateUsersEnv, existingUsers?: TestEnvUsers) {
	if (existingUsers) {
		await env.db
			.delete(users)
			.where(inArray(users.id, [existingUsers.user.id, existingUsers.user2.id]));
	}
	const userPassword = "12345678";
	async function createAndLoginUser() {
		const user = (
			await env.request
				.post("/user")
				.send({
					email: createId() + "@example.com",
					password: userPassword,
					registrationPassword: env.registrationPassword,
					captcha: await solveCaptcha(env),
				})
				.expect(201)
		).body;
		const response = await env.request.post("/auth/login").send({
			email: user.email,
			password: userPassword,
			captcha: await solveCaptcha(env),
		});
		if (response.status !== 200) {
			console.error(response.body);
		}
		assert.strictEqual(response.status, 200);
		const cookies = convertResponseCookiesToRequestCookies(response);
		return { user, cookies };
	}

	const { user, cookies } = await createAndLoginUser();
	const { user: user2, cookies: cookies2 } = await createAndLoginUser();

	return { userPassword, user, cookies, user2, cookies2 };
}
export function setupTestSuite(
	envCallback: (env: TestEnv) => Promise<void> | void,
	setCaptchaToEasyMode: boolean = true,
) {
	let env: TestEnv;

	before(async () => {
		DbService.dbUrlConfigKey = "TEST_DB_URL";

		const { AppModule, configureApp } = await import("../src/app.module.js");
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		const app = moduleFixture.createNestApplication<NestExpressApplication>();
		configureApp(app);
		const configService: ConfigService<ConfigData> = app.get(ConfigService);
		configService.set("INSECURE_EASY_CAPTCHA_FOR_TESTS", true);
		const registrationPassword = configService.getOrThrow("REGISTRATION_PASSWORD", {
			infer: true,
		});
		await app.init();
		const server: App = app.getHttpServer();

		function isMethod(val: string): val is ValueFromArray<typeof methods> {
			return !!methods.find((method) => method === val);
		}

		const createUsersEnv: CreateUsersEnv = {
			db: app.get(DBClass),
			registrationPassword,
			get request() {
				const testAgent = request(server);
				return new Proxy(testAgent, {
					get(target, name, receiver) {
						if (typeof name === "string" && isMethod(name)) {
							return (url: string) =>
								target[name](url).set("X-OpenSelves-Version", API_VERSION);
						} else {
							return Reflect.get(target, name, receiver) as unknown;
						}
					},
				});
			},
		};

		env = {
			...createUsersEnv,
			app,
			configService,
		};
		configService.set("INSECURE_EASY_CAPTCHA_FOR_TESTS", setCaptchaToEasyMode);
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
		env = { ...sourceEnv, users: await createUsers(sourceEnv) };
		await envCallback(env);
	}, setCaptchaToEasyMode);

	if (recreateUsersBeforeEach) {
		beforeEach(async () => {
			env.users = await createUsers(env, env.users);
		});
	}
}

export async function waitFor(timeInMs: number) {
	return new Promise((resolve) => setTimeout(resolve, timeInMs));
}

export function convertResponseCookiesToRequestCookies(response: Response): string {
	const responseCookies: string[] = response.get("Set-Cookie") || [];
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
		console.log(cookies);
		throw new Error(`${cookieName} not found in cookies`);
	}
	return value;
}

export async function solveCaptcha(env: CreateUsersEnv): Promise<Captcha> {
	const response = await env.request.get("/captcha/challenge");

	if (response.status !== 200) {
		console.error(response.body);
	}
	assert.strictEqual(response.status, 200);

	const challenge = response.body;
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
	callback: (captcha: Captcha | object | string | null | undefined) => Promise<request.Response>,
) {
	let usedCaptcha: Captcha | null = null;
	for (const { test: testName, status, captcha: getCaptcha } of [
		{
			test: `POST ${successCode} valid captcha`,
			status: successCode,
			captcha: async () => (usedCaptcha = await solveCaptcha(getEnv())),
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
			test: "POST 401 invalid captcha",
			status: 401,
			captcha: {
				challenge: {},
				solution: {},
			},
		},
		{
			test: "POST 401 no solution captcha",
			status: 401,
			captcha: async () => {
				const captcha = await solveCaptcha(getEnv());
				return { ...captcha, solution: {} };
			},
		},
		{
			test: "POST 401 expired captcha",
			status: 401,
			captcha: async () => {
				const env = getEnv();

				const initialChallengeTtl = env.configService.get("CAPTCHA_CHALLENGE_TTL_SECONDS");
				env.configService.set("CAPTCHA_CHALLENGE_TTL_SECONDS", -1);

				const challenge = await env.app.get(CaptchaService).createChallenge(1);

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
	]) {
		doTest(testName, async () => {
			let captcha: Captcha | object | string | null | undefined;
			if (typeof getCaptcha === "function") {
				captcha = await getCaptcha();
			} else {
				captcha = getCaptcha;
			}
			const response = await callback(captcha);

			if (response.status !== status) {
				console.error(response.body);
			}
			assert.strictEqual(response.status, status);
		});
	}
}

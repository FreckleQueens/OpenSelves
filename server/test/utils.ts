import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { createId } from "@paralleldrive/cuid2";
import { inArray } from "drizzle-orm";
import { type User, users } from "openselves-common/db";
import request, { type Response } from "supertest";
import type { App } from "supertest/types.js";

import { AppModule, configureApp } from "../src/app.module.js";
import type { ConfigData } from "../src/config.data.js";
import { DBClass, DbService } from "../src/db/db.service.js";
import type { DB } from "../src/db/drizzle.js";

type CreateUsersEnv = {
	db: DB;
	registrationPassword: string;
	server: App;
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
	users: TestEnvUsers;
} & CreateUsersEnv;
async function createUsers(env: CreateUsersEnv, existingUsers?: TestEnvUsers) {
	if (existingUsers) {
		await env.db
			.delete(users)
			.where(inArray(users.id, [existingUsers.user.id, existingUsers.user2.id]));
	}
	const userPassword = "12345678";
	async function createAndLoginUser() {
		const user = (
			await request(env.server)
				.post("/user")
				.send({
					email: createId() + "@example.com",
					password: userPassword,
					registrationPassword: env.registrationPassword,
				})
				.expect(201)
		).body;
		const response = await request(env.server)
			.post("/auth/login")
			.send({ email: user.email, password: userPassword })
			.expect(200);
		const cookies = convertResponseCookiesToRequestCookies(response);
		return { user, cookies };
	}

	const { user, cookies } = await createAndLoginUser();
	const { user: user2, cookies: cookies2 } = await createAndLoginUser();

	return { userPassword, user, cookies, user2, cookies2 };
}
export function setupTestSuite(
	envCallback: (env: TestEnv) => void,
	recreateUsersBeforeEach: boolean = false,
) {
	let env: TestEnv;

	beforeAll(async () => {
		DbService.dbUrlConfigKey = "TEST_DB_URL";

		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		const app: INestApplication<App> = moduleFixture.createNestApplication();
		configureApp(app);
		const configService: ConfigService<ConfigData> = app.get(ConfigService);
		const registrationPassword = configService.getOrThrow("REGISTRATION_PASSWORD", {
			infer: true,
		});
		await app.init();
		const server: App = app.getHttpServer();

		const createUsersEnv: CreateUsersEnv = {
			db: app.get(DBClass),
			registrationPassword,
			server,
		};

		env = {
			...createUsersEnv,
			app,
			configService,
			users: await createUsers(createUsersEnv),
		};
		envCallback(env);
	});

	afterAll(async () => {
		await env.app.close();
	});

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

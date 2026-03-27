import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { TOKEN_EXPIRED_ERROR } from "openselves-common";
import { User, sessions, users } from "openselves-common/db";
import request, { Response } from "supertest";
import { App } from "supertest/types.js";

import { AppModule, configureApp } from "../src/app.module.js";
import { DBClass, DbService } from "../src/auth/db/db.service.js";
import { ConfigData } from "../src/config.data.js";
import { waitFor } from "./utils.js";

const expectCookies = request.cookies;

describe("AppController (e2e)", () => {
	let app: INestApplication<App>;
	let server: App;
	let configService: ConfigService<ConfigData>;
	let registrationPassword: string;

	let user: Omit<User, "passwordHash">;
	let cookies: string;
	const userPassword = "12345678";

	let user2: Omit<User, "passwordHash">;

	function convertResponseCookiesToRequestCookies(response: Response): string {
		const responseCookies: string[] = response.get("Set-Cookie") || [];
		return responseCookies.map((str) => str.split(";")[0]).join("; ");
	}

	function extractCookie(cookieName: string, cookies: string) {
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

	async function makeExpiredAccessToken(originalTokenForPayload: string) {
		const jwtService = app.get(JwtService);
		const { iat, exp, ...payload } = jwtService.decode(originalTokenForPayload);
		const expiredAccessToken = await jwtService.signAsync(payload, {
			expiresIn: 1, // 1 second
		});
		await waitFor(2000);
		return expiredAccessToken;
	}

	async function makeRefreshTokenExpired() {
		const refreshTokenDuration = configService.getOrThrow("REFRESH_TOKEN_DURATION", {
			infer: true,
		});

		const refreshToken = extractCookie("refreshToken", cookies);

		// time is (refresh token duration + 1 second) ago
		const time = new Date(Date.now() - refreshTokenDuration * 1000 - 1000);
		await app
			.get(DBClass)
			.update(sessions)
			.set({ createdAt: time, updatedAt: time })
			.where(eq(sessions.token, refreshToken));
	}

	beforeAll(async () => {
		DbService.dbUrlConfigKey = "TEST_DB_URL";

		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication();
		configureApp(app);
		configService = app.get(ConfigService);
		registrationPassword = configService.getOrThrow("REGISTRATION_PASSWORD", { infer: true });
		await app.init();
		server = app.getHttpServer();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		await app.get(DBClass).delete(users);
		user = (
			await request(server)
				.post("/user")
				.send({ email: "jane@example.com", password: userPassword, registrationPassword })
				.expect(201)
		).body;
		const response = await request(server)
			.post("/auth/login")
			.send({ email: user.email, password: userPassword })
			.expect(200);
		cookies = convertResponseCookiesToRequestCookies(response);

		user2 = (
			await request(server)
				.post("/user")
				.send({ email: "bob@example.com", password: userPassword, registrationPassword })
				.expect(201)
		).body;
	});

	describe("/auth", () => {
		describe("/login", () => {
			test("POST 200", async () => {
				const response = await request(server)
					.post("/auth/login")
					.send({ email: user.email, password: userPassword })
					.expect(200)
					.expect("Content-Type", /json/)
					.expect(
						// TODO@supertest: the case is wrong because of a bug in supertest, fix all TODOs in tag when this eventually fails
						expectCookies
							.set({
								name: "accesstoken",
								options: {
									httponly: true,
									"max-age": configService.getOrThrow("ACCESS_TOKEN_DURATION", {
										infer: true,
									}),
								},
							})
							.set({
								name: "refreshtoken",
								options: {
									httponly: true,
									"max-age": configService.getOrThrow("REFRESH_TOKEN_DURATION", {
										infer: true,
									}),
								},
							}),
					);
				expect(response.body.accessToken).not.toBeDefined();
				expect(response.body.refreshToken).not.toBeDefined();
				expect(response.body.userId).toBeDefined();

				const accessToken = extractCookie(
					"accessToken",
					convertResponseCookiesToRequestCookies(response),
				);
				const tokenPayload = app.get(JwtService).decode(accessToken);
				const accessTokenDuration = configService.getOrThrow("ACCESS_TOKEN_DURATION", {
					infer: true,
				});
				expect(tokenPayload.exp - tokenPayload.iat).toBe(accessTokenDuration);
			});

			for (const { test: testName, data, status } of [
				{
					test: "POST 401 wrong password",
					data: () => ({ email: user.email, password: "wrong password" }),
					status: 401,
				},
				{
					test: "POST 401 unknown email address",
					data: () => ({ email: "unknown.email@example.com", password: userPassword }),
					status: 401,
				},
				{
					test: "POST 400 no email provided",
					data: () => ({ password: userPassword }),
					status: 400,
				},
				{
					test: "POST 400 empty email provided",
					data: () => ({ email: "", password: userPassword }),
					status: 400,
				},
				{
					test: "POST 400 invalid email provided",
					data: () => ({ email: "not an email address", password: userPassword }),
					status: 400,
				},
				{
					test: "POST 400 no password provided",
					data: () => ({ email: user.email }),
					status: 400,
				},
				{
					test: "POST 400 empty password",
					data: () => ({ email: user.email, password: "" }),
					status: 400,
				},
			]) {
				test(testName, async () => {
					await request(server)
						.post("/auth/login")
						.send(data())
						.expect(status)
						.expect("Content-Type", /json/)
						.expect(expectCookies.set({ name: "refreshtoken" }, false)); // TODO@supertest
				});
			}
		});

		describe("/refresh", () => {
			async function testAuthRefreshFails(cookies: string, status: number) {
				const response = await request(server)
					.post("/auth/refresh")
					.set("Cookie", cookies)
					.expect(status)
					.expect("Content-Type", /json/)
					.expect(expectCookies.set({ name: "refreshtoken" }, false)); // TODO@supertest
				expect(response.body.accessToken).not.toBeDefined();
				expect(response.body.refreshToken).not.toBeDefined();
			}

			test("POST 200", async () => {
				const response = await request(server)
					.post("/auth/refresh")
					.set("Cookie", cookies)
					.expect(200)
					.expect("Content-Type", /json/)
					.expect(
						// TODO@supertest
						expectCookies
							.set({
								name: "accesstoken",
								options: {
									httponly: true,
									"max-age": configService.getOrThrow("ACCESS_TOKEN_DURATION", {
										infer: true,
									}),
								},
							})
							.set({
								name: "refreshtoken",
								options: {
									httponly: true,
									"max-age": configService.getOrThrow("REFRESH_TOKEN_DURATION", {
										infer: true,
									}),
								},
							}),
					);
				expect(response.body.accessToken).not.toBeDefined();
				expect(response.body.refreshToken).not.toBeDefined();

				const newCookies = convertResponseCookiesToRequestCookies(response);

				const oldRefreshToken = extractCookie("refreshToken", cookies);
				const newRefreshToken = extractCookie(
					"refreshToken",
					convertResponseCookiesToRequestCookies(response),
				);
				expect(newRefreshToken).not.toBe(oldRefreshToken);

				await request(server)
					.get("/user/" + user.id)
					.set("Cookie", newCookies)
					.expect(200);

				// Old refresh token must be revoked
				await testAuthRefreshFails(cookies, 401);

				// New refresh token must work
				await request(server)
					.post("/auth/refresh")
					.set("Cookie", newCookies)
					.expect(200)
					.expect("Content-Type", /json/);
			});

			test("POST 401 invalid token", async () => {
				await testAuthRefreshFails("refreshToken=notavalidtoken", 401);
			});

			test("POST 401 revoked token", async () => {
				await request(server).post("/auth/logout").set("Cookie", cookies).expect(200);
				await testAuthRefreshFails(cookies, 401);
			});

			test("POST 401 expired token", async () => {
				await makeRefreshTokenExpired();
				await testAuthRefreshFails(cookies, 401);
			});

			test("POST 401 no token provided", async () => {
				await testAuthRefreshFails("", 401);
			});

			test("POST 401 empty token", async () => {
				await testAuthRefreshFails("refreshToken=", 401);
			});
		});

		describe("/logout", () => {
			test("POST 200", async () => {
				const response = await request(server)
					.post("/auth/logout")
					.set("Cookie", cookies)
					.expect(200)
					.expect("Content-Type", /json/)
					.expect(
						expectCookies
							.set({
								name: "accesstoken",
								options: { expires: "Thu, 01 Jan 1970 00:00:00 GMT" },
							})
							.set({
								name: "refreshtoken",
								options: { expires: "Thu, 01 Jan 1970 00:00:00 GMT" },
							}),
					); // TODO@supertest
				expect(response.body.accessToken).not.toBeDefined();
				expect(response.body.refreshToken).not.toBeDefined();

				// /auth/refresh already tested
			});

			test("POST 401 revoked token", async () => {
				// Access token works
				await request(server)
					.get(`/user/${user.id}`)
					.set("Cookie", cookies)
					.expect(200)
					.expect("Content-Type", /json/);

				const response = await request(server)
					.post("/auth/logout")
					.set("Cookie", cookies)
					.expect(200)
					.expect("Content-Type", /json/);
				const newCookies = convertResponseCookiesToRequestCookies(response);

				// Access token removed from cookies
				await request(server)
					.get(`/user/${user.id}`)
					.set("Cookie", newCookies)
					.expect(401)
					.expect("Content-Type", /json/);

				// Refresh token revoked
				await request(server)
					.post("/auth/refresh")
					.set("Cookie", cookies)
					.expect(401)
					.expect("Content-Type", /json/);
			});

			test("POST 401 expired token", async () => {
				await makeRefreshTokenExpired();

				await request(server)
					.post("/auth/logout")
					.set("Cookie", cookies)
					.expect(401)
					.expect("Content-Type", /json/);
			});
		});

		test("Access tokens expire", async () => {
			await request(server)
				.get("/user/" + user.id)
				.set("Cookie", cookies)
				.expect(200);
			const accessToken = extractCookie("accessToken", cookies);
			const expiredAccessToken = await makeExpiredAccessToken(accessToken);
			const response = await request(server)
				.get("/user/" + user.id)
				.set("Cookie", `accessToken=${expiredAccessToken}`)
				.expect(401)
				.expect("Content-Type", /json/);
			expect(response.body.name).toBe(TOKEN_EXPIRED_ERROR);
		});
	});

	describe("/user", () => {
		test("POST 201", async () => {
			const response = await request(server)
				.post("/user")
				.send({ email: "john@example.com", password: "12345678", registrationPassword })
				.expect(201)
				.expect("Content-Type", /json/);
			expect(Object.keys(response.body)).toEqual(["id", "email", "createdAt"]);
		});

		for (const testCase of [
			{ test: "Invalid email", email: "is_not_an_email", password: "12345678" },
			{ test: "Password too short", email: "john@example.com", password: "123" },
			{ test: "Missing password", email: "john@example.com" },
			{ test: "Missing email", password: "12345678" },
		]) {
			test(`POST ${testCase.test} 400`, async () => {
				await request(server)
					.post("/user")
					.send({ registrationPassword, ...testCase })
					.expect(400)
					.expect("Content-Type", /json/);
			});
		}

		test("POST existing email address 409", async () => {
			await request(server)
				.post("/user")
				.send({ email: "john@example.com", password: "12345678", registrationPassword })
				.expect(201);
			await request(server)
				.post("/user")
				.send({ email: "john@example.com", password: "87654321", registrationPassword })
				.expect(409)
				.expect("Content-Type", /json/);
		});

		test("POST authenticated 401", async () => {
			await request(server)
				.post("/user")
				.set("Cookie", cookies)
				.send({ email: "john@example.com", password: "12345678", registrationPassword })
				.expect(401)
				.expect("Content-Type", /json/);
		});

		test("POST without general registration password 401", async () => {
			await request(server)
				.post("/user")
				.send({ email: "john@example.com", password: "12345678" })
				.expect(401)
				.expect("Content-Type", /json/);
		});

		test("GET 200", async () => {
			const response = await request(server)
				.get("/user/" + user.id)
				.set("Cookie", cookies)
				.expect(200)
				.expect("Content-Type", /json/);
			expect(response.body).toEqual({
				id: user.id,
				email: user.email,
				createdAt: user.createdAt,
			});
		});

		test("GET unauthenticated 401", async () => {
			await request(server)
				.get("/user/" + user.id)
				.expect(401)
				.expect("Content-Type", /json/);
		});

		test("GET other user 401", async () => {
			await request(server)
				.get("/user/" + user2.id)
				.set("Cookie", cookies)
				.expect(401)
				.expect("Content-Type", /json/);
		});

		test("PUT 404", async () => {
			const newEmail = "new.jane@example.org";
			await request(server)
				.put("/user/" + user.id)
				.send({ email: newEmail })
				.expect(404);
			const response = await request(server)
				.get("/user/" + user.id)
				.set("Cookie", cookies)
				.expect(200);
			expect(response.body.email).toBe(user.email);
			expect(response.body.email).not.toBe(newEmail);
		});

		test("PATCH email 200", async () => {
			const newEmail = "new.jane@example.org";

			await request(server)
				.patch("/user/" + user.id)
				.set("Cookie", cookies)
				.send({ email: newEmail })
				.expect(200);
			const response = await request(server)
				.get("/user/" + user.id)
				.set("Cookie", cookies)
				.expect(200);
			expect(response.body.email).toBe(newEmail);
			expect(response.body.email).not.toBe(user.email);
		});

		test("PATCH unauthenticated 401", async () => {
			const newEmail = "new.jane@example.org";
			await request(server)
				.patch("/user/" + user.id)
				.send({ email: newEmail })
				.expect(401)
				.expect("Content-Type", /json/);
		});

		test("PATCH other user 401", async () => {
			const newEmail = "new.jane@example.org";
			await request(server)
				.patch("/user/" + user2.id)
				.set("Cookie", cookies)
				.send({ email: newEmail })
				.expect(401)
				.expect("Content-Type", /json/);
		});

		test("PATCH bad email 400", async () => {
			const newEmail = "not an email address";
			await request(server)
				.patch("/user/" + user.id)
				.set("Cookie", cookies)
				.send({ email: newEmail })
				.expect(400);
			const response = await request(server)
				.get("/user/" + user.id)
				.set("Cookie", cookies)
				.expect(200);
			expect(response.body.email).toBe(user.email);
			expect(response.body.email).not.toBe(newEmail);
		});

		test("PATCH password 200", async () => {
			const oldPassword = userPassword;
			const newPassword = "87654321";
			await request(server)
				.patch("/user/" + user.id)
				.set("Cookie", cookies)
				.send({ oldPassword, newPassword })
				.expect(200);
		});

		test("PATCH missing oldPassword 400", async () => {
			await request(server)
				.patch("/user/" + user.id)
				.set("Cookie", cookies)
				.send({ newPassword: "87654321" })
				.expect(400);
		});

		test("PATCH missing newPassword 400", async () => {
			await request(server)
				.patch("/user/" + user.id)
				.set("Cookie", cookies)
				.send({ oldPassword: userPassword })
				.expect(400);
		});

		test("PATCH wrong old password 401", async () => {
			const oldPassword = "wrong old password";
			const newPassword = "87654321";
			await request(server)
				.patch("/user/" + user.id)
				.set("Cookie", cookies)
				.send({ oldPassword, newPassword })
				.expect(401);
		});

		test("PATCH bad new password 400", async () => {
			const oldPassword = userPassword;
			const newPassword = "short"; // Less than 8 characters
			await request(server)
				.patch("/user/" + user.id)
				.set("Cookie", cookies)
				.send({ oldPassword, newPassword })
				.expect(400);
		});

		test("DELETE 200", async () => {
			await request(server)
				.delete("/user/" + user.id)
				.set("Cookie", cookies)
				.expect(200);
			await request(server)
				.get("/user/" + user.id)
				.set("Cookie", cookies)
				.expect(404);
		});

		test("DELETE unauthenticated fails", async () => {
			await request(server)
				.delete("/user/" + user.id)
				.expect(401)
				.expect("Content-Type", /json/);
		});

		test("DELETE other user 401", async () => {
			await request(server)
				.delete("/user/" + user2.id)
				.set("Cookie", cookies)
				.expect(401)
				.expect("Content-Type", /json/);
		});
	});
});

import { describe, expect, test } from "@jest/globals";
import { JwtService } from "@nestjs/jwt";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { TOKEN_EXPIRED_ERROR } from "openselves-common";
import { sessions } from "openselves-common/db";
import request from "supertest";

import {
	type TestEnv,
	convertResponseCookiesToRequestCookies,
	extractCookie,
	setupTestSuite,
	testCaptcha,
	waitFor,
} from "./utils.js";

const expectCookies = request.cookies;

describe("Auth (e2e)", () => {
	let env: TestEnv;

	setupTestSuite((testEnv) => {
		env = testEnv;
	}, true);

	async function makeExpiredAccessToken(originalTokenForPayload: string) {
		const jwtService = env.app.get(JwtService);
		const { iat, exp, ...payload } = jwtService.decode(originalTokenForPayload);
		const expiredAccessToken = await jwtService.signAsync(payload, {
			expiresIn: 1, // 1 second
		});
		await waitFor(2000);
		return expiredAccessToken;
	}

	async function makeRefreshTokenExpired() {
		const refreshTokenDuration = env.configService.getOrThrow("REFRESH_TOKEN_DURATION", {
			infer: true,
		});

		const refreshToken = extractCookie("refreshToken", env.users.cookies);

		// time is (refresh token duration + 1 second) ago
		const time = new Date(Date.now() - refreshTokenDuration * 1000 - 1000);
		await env.db
			.update(sessions)
			.set({ createdAt: time, updatedAt: time })
			.where(eq(sessions.token, refreshToken));
	}

	describe("/auth", () => {
		describe("/login", () => {
			test("POST 200", async () => {
				const response = await env.request
					.post("/auth/login")
					.send({
						email: env.users.user.email,
						password: env.users.userPassword,
						captcha: env.captcha,
					})
					.expect(200)
					.expect("Content-Type", /json/)
					.expect(
						// TODO@supertest: the case is wrong because of a bug in supertest, fix all TODOs in tag when this eventually fails
						expectCookies
							.set({
								name: "accesstoken",
								options: {
									httponly: true,
									"max-age": env.configService.getOrThrow(
										"ACCESS_TOKEN_DURATION",
										{
											infer: true,
										},
									),
								},
							})
							.set({
								name: "refreshtoken",
								options: {
									httponly: true,
									"max-age": env.configService.getOrThrow(
										"REFRESH_TOKEN_DURATION",
										{
											infer: true,
										},
									),
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
				const tokenPayload = env.app.get(JwtService).decode(accessToken);
				const accessTokenDuration = env.configService.getOrThrow("ACCESS_TOKEN_DURATION", {
					infer: true,
				});
				expect(tokenPayload.exp - tokenPayload.iat).toBe(accessTokenDuration);
			});

			for (const { test: testName, data, status } of [
				{
					test: "POST 401 wrong password",
					status: 401,
					data: () => ({ email: env.users.user.email, password: "wrong password" }),
				},
				{
					test: "POST 401 unknown email address",
					status: 401,
					data: () => ({
						email: "unknown.email@example.com",
						password: env.users.userPassword,
					}),
				},
				{
					test: "POST 400 no email provided",
					status: 400,
					data: () => ({ password: env.users.userPassword }),
				},
				{
					test: "POST 400 empty email provided",
					status: 400,
					data: () => ({ email: "", password: env.users.userPassword }),
				},
				{
					test: "POST 400 invalid email provided",
					status: 400,
					data: () => ({
						email: "not an email address",
						password: env.users.userPassword,
					}),
				},
				{
					test: "POST 400 no password provided",
					status: 400,
					data: () => ({ email: env.users.user.email }),
				},
				{
					test: "POST 400 empty password",
					status: 400,
					data: () => ({ email: env.users.user.email, password: "" }),
				},
			]) {
				test(testName, async () => {
					await env.request
						.post("/auth/login")
						.send({
							...data(),
							captcha: env.captcha,
						})
						.expect(status)
						.expect("Content-Type", /json/)
						.expect(expectCookies.set({ name: "refreshtoken" }, false)); // TODO@supertest
				});
			}

			testCaptcha(
				() => env,
				200,
				async (captcha) => {
					return env.request.post("/auth/login").send({
						email: env.users.user.email,
						password: env.users.userPassword,
						captcha: captcha,
					});
				},
			);
		});

		describe("/refresh", () => {
			async function testAuthRefreshFails(cookies: string, status: number) {
				const response = await env.request
					.post("/auth/refresh")
					.set("Cookie", cookies)
					.expect(status)
					.expect("Content-Type", /json/)
					.expect(expectCookies.set({ name: "refreshtoken" }, false)); // TODO@supertest
				expect(response.body.accessToken).not.toBeDefined();
				expect(response.body.refreshToken).not.toBeDefined();
			}

			test("POST 200", async () => {
				const response = await env.request
					.post("/auth/refresh")
					.set("Cookie", env.users.cookies)
					.expect(200)
					.expect("Content-Type", /json/)
					.expect(
						// TODO@supertest
						expectCookies
							.set({
								name: "accesstoken",
								options: {
									httponly: true,
									"max-age": env.configService.getOrThrow(
										"ACCESS_TOKEN_DURATION",
										{
											infer: true,
										},
									),
								},
							})
							.set({
								name: "refreshtoken",
								options: {
									httponly: true,
									"max-age": env.configService.getOrThrow(
										"REFRESH_TOKEN_DURATION",
										{
											infer: true,
										},
									),
								},
							}),
					);
				expect(response.body.accessToken).not.toBeDefined();
				expect(response.body.refreshToken).not.toBeDefined();

				const newCookies = convertResponseCookiesToRequestCookies(response);

				const oldAccessToken = extractCookie("accessToken", env.users.cookies);
				const newAccessToken = extractCookie("accessToken", newCookies);
				expect(newAccessToken).not.toBe(oldAccessToken);

				const oldRefreshToken = extractCookie("refreshToken", env.users.cookies);
				const newRefreshToken = extractCookie("refreshToken", newCookies);
				expect(newRefreshToken).not.toBe(oldRefreshToken);

				await env.request
					.get("/user/" + env.users.user.id)
					.set("Cookie", newCookies)
					.expect(200);

				// Old refresh token must be revoked
				await testAuthRefreshFails(env.users.cookies, 401);

				// New access token must work
				await env.request
					.get("/user/" + env.users.user.id)
					.set("Cookie", newCookies)
					.expect(200)
					.expect("Content-Type", /json/);

				// New refresh token must work
				await env.request
					.post("/auth/refresh")
					.set("Cookie", newCookies)
					.expect(200)
					.expect("Content-Type", /json/);
			});

			test("POST 401 invalid refresh token", async () => {
				await testAuthRefreshFails("refreshToken=notavalidtoken", 401);
			});

			test("POST 401 revoked refresh token", async () => {
				await env.request.post("/auth/logout").set("Cookie", env.users.cookies).expect(200);
				await testAuthRefreshFails(env.users.cookies, 401);
			});

			test("POST 401 expired refresh token", async () => {
				await makeRefreshTokenExpired();
				await testAuthRefreshFails(env.users.cookies, 401);
			});

			test("POST 401 no refresh token provided", async () => {
				await testAuthRefreshFails("", 401);
			});

			test("POST 401 empty refresh token", async () => {
				await testAuthRefreshFails("refreshToken=", 401);
			});
		});

		describe("/logout", () => {
			test("POST 200", async () => {
				const response = await env.request
					.post("/auth/logout")
					.set("Cookie", env.users.cookies)
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
				await env.request
					.get(`/user/${env.users.user.id}`)
					.set("Cookie", env.users.cookies)
					.expect(200)
					.expect("Content-Type", /json/);

				const response = await env.request
					.post("/auth/logout")
					.set("Cookie", env.users.cookies)
					.expect(200)
					.expect("Content-Type", /json/);
				const newCookies = convertResponseCookiesToRequestCookies(response);

				// Access token removed from cookies
				await env.request
					.get(`/user/${env.users.user.id}`)
					.set("Cookie", newCookies)
					.expect(401)
					.expect("Content-Type", /json/);

				// Refresh token revoked
				await env.request
					.post("/auth/refresh")
					.set("Cookie", env.users.cookies)
					.expect(401)
					.expect("Content-Type", /json/);
			});

			test("POST 401 expired token", async () => {
				await makeRefreshTokenExpired();

				await env.request
					.post("/auth/logout")
					.set("Cookie", env.users.cookies)
					.expect(401)
					.expect("Content-Type", /json/);
			});
		});

		test("Access tokens expire", async () => {
			await env.request
				.get("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.expect(200);
			const accessToken = extractCookie("accessToken", env.users.cookies);
			const expiredAccessToken = await makeExpiredAccessToken(accessToken);
			const response = await env.request
				.get("/user/" + env.users.user.id)
				.set("Cookie", `accessToken=${expiredAccessToken}`)
				.expect(401)
				.expect("Content-Type", /json/);
			expect(response.body.name).toBe(TOKEN_EXPIRED_ERROR);
		});
	});

	describe("/user", () => {
		test("POST 201", async () => {
			const response = await env.request
				.post("/user")
				.send({
					email: createId() + "@example.com",
					password: "12345678",
					registrationPassword: env.registrationPassword,
					captcha: env.captcha,
				})
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
				await env.request
					.post("/user")
					.send({
						registrationPassword: env.registrationPassword,
						...testCase,
						captcha: env.captcha,
					})
					.expect(400)
					.expect("Content-Type", /json/);
			});
		}

		test("POST existing email address 409", async () => {
			const email = createId() + "@example.com";
			await env.request
				.post("/user")
				.send({
					email: email,
					password: "12345678",
					registrationPassword: env.registrationPassword,
					captcha: env.captcha,
				})
				.expect(201);
			await env.request
				.post("/user")
				.send({
					email: email,
					password: "87654321",
					registrationPassword: env.registrationPassword,
					captcha: env.captcha,
				})
				.expect(409)
				.expect("Content-Type", /json/);
		});

		test("POST authenticated 401", async () => {
			await env.request
				.post("/user")
				.set("Cookie", env.users.cookies)
				.send({
					email: "john@example.com",
					password: "12345678",
					registrationPassword: env.registrationPassword,
					captcha: env.captcha,
				})
				.expect(401)
				.expect("Content-Type", /json/);
		});

		test("POST without general registration password 401", async () => {
			await env.request
				.post("/user")
				.send({ email: "john@example.com", password: "12345678", captcha: env.captcha })
				.expect(401)
				.expect("Content-Type", /json/);
		});

		testCaptcha(
			() => env,
			201,
			async (captcha) => {
				return env.request.post("/user").send({
					email: createId() + "@example.com",
					password: "12345678",
					registrationPassword: env.registrationPassword,
					captcha,
				});
			},
		);

		test("GET 200", async () => {
			const response = await env.request
				.get("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.expect(200)
				.expect("Content-Type", /json/);
			expect(response.body).toEqual({
				id: env.users.user.id,
				email: env.users.user.email,
				createdAt: env.users.user.createdAt,
			});
		});

		test("GET unauthenticated 401", async () => {
			await env.request
				.get("/user/" + env.users.user.id)
				.expect(401)
				.expect("Content-Type", /json/);
		});

		test("GET other user 401", async () => {
			await env.request
				.get("/user/" + env.users.user2.id)
				.set("Cookie", env.users.cookies)
				.expect(401)
				.expect("Content-Type", /json/);
		});

		test("PUT 404", async () => {
			const newEmail = "new.jane@example.org";
			await env.request
				.put("/user/" + env.users.user.id)
				.send({ email: newEmail })
				.expect(404);
			const response = await env.request
				.get("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.expect(200);
			expect(response.body.email).toBe(env.users.user.email);
			expect(response.body.email).not.toBe(newEmail);
		});

		test("PATCH email 200", async () => {
			const newEmail = "new.jane@example.org";

			await env.request
				.patch("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.send({ email: newEmail })
				.expect(200);
			const response = await env.request
				.get("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.expect(200);
			expect(response.body.email).toBe(newEmail);
			expect(response.body.email).not.toBe(env.users.user.email);
		});

		test("PATCH unauthenticated 401", async () => {
			const newEmail = "new.jane@example.org";
			await env.request
				.patch("/user/" + env.users.user.id)
				.send({ email: newEmail })
				.expect(401)
				.expect("Content-Type", /json/);
		});

		test("PATCH other user 401", async () => {
			const newEmail = "new.jane@example.org";
			await env.request
				.patch("/user/" + env.users.user2.id)
				.set("Cookie", env.users.cookies)
				.send({ email: newEmail })
				.expect(401)
				.expect("Content-Type", /json/);
		});

		test("PATCH bad email 400", async () => {
			const newEmail = "not an email address";
			await env.request
				.patch("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.send({ email: newEmail })
				.expect(400);
			const response = await env.request
				.get("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.expect(200);
			expect(response.body.email).toBe(env.users.user.email);
			expect(response.body.email).not.toBe(newEmail);
		});

		test("PATCH password 200", async () => {
			const oldPassword = env.users.userPassword;
			const newPassword = "87654321";
			await env.request
				.patch("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.send({ oldPassword, newPassword })
				.expect(200);
		});

		test("PATCH missing oldPassword 400", async () => {
			await env.request
				.patch("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.send({ newPassword: "87654321" })
				.expect(400);
		});

		test("PATCH missing newPassword 400", async () => {
			await env.request
				.patch("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.send({ oldPassword: env.users.userPassword })
				.expect(400);
		});

		test("PATCH wrong old password 401", async () => {
			const oldPassword = "wrong old password";
			const newPassword = "87654321";
			await env.request
				.patch("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.send({ oldPassword, newPassword })
				.expect(401);
		});

		test("PATCH bad new password 400", async () => {
			const oldPassword = env.users.userPassword;
			const newPassword = "short"; // Less than 8 characters
			await env.request
				.patch("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.send({ oldPassword, newPassword })
				.expect(400);
		});

		test("DELETE 200", async () => {
			await env.request
				.delete("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.expect(200);
			await env.request
				.get("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.expect(404);
		});

		test("DELETE unauthenticated fails", async () => {
			await env.request
				.delete("/user/" + env.users.user.id)
				.expect(401)
				.expect("Content-Type", /json/);
		});

		test("DELETE other user 401", async () => {
			await env.request
				.delete("/user/" + env.users.user2.id)
				.set("Cookie", env.users.cookies)
				.expect(401)
				.expect("Content-Type", /json/);
		});
	});
});

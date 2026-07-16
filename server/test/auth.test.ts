import { JwtService } from "@nestjs/jwt";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import assert from "node:assert";
import test, { describe } from "node:test";
import { GetUser, TOKEN_EXPIRED_ERROR, parseApiResult } from "openselves-common";
import { sessions } from "openselves-common/db";

import type { UserAuthData } from "./TestQueryBuilder.js";
import {
	type TestEnvWithUsers,
	convertResponseCookiesToRequestCookies,
	extractCookie,
	setupTestSuiteWithUsers,
	solveCaptcha,
	testCaptcha,
	verifyUser1Email,
	waitFor,
} from "./utils.js";

describe("Auth (e2e)", () => {
	let env: TestEnvWithUsers;

	setupTestSuiteWithUsers(
		(testEnv) => {
			env = testEnv;
		},
		undefined,
		true,
	);

	async function makeExpiredAccessToken(originalTokenForPayload: string) {
		const jwtService = env.app.get(JwtService);
		const { iat, exp, ...payload } = jwtService.decode(originalTokenForPayload);
		const expiredAccessToken = await jwtService.signAsync(payload, {
			expiresIn: 1, // 1 second
		});
		await waitFor(2000);
		return expiredAccessToken;
	}

	async function makeRefreshTokenExpired(
		persistSession: boolean = false,
		forceShortTtl: boolean = false,
	) {
		const refreshTokenDuration = env.configService.getOrThrow(
			persistSession && !forceShortTtl
				? "REFRESH_TOKEN_DURATION"
				: "REFRESH_TOKEN_SHORT_DURATION",
			{
				infer: true,
			},
		);

		const refreshToken = extractCookie("refreshToken", env.users.user1.cookies);

		// time is (refresh token duration + 1 second) ago
		const time = new Date(Date.now() - refreshTokenDuration * 1000 - 1000);
		await env.db
			.update(sessions)
			.set({ persist: persistSession, createdAt: time, updatedAt: time })
			.where(eq(sessions.token, refreshToken));
	}

	describe("/auth", () => {
		describe("/login", () => {
			test("POST 200", async () => {
				const response = await env.request
					.post("/auth/login")
					.send({
						email: env.users.user1.api.email,
						password: env.users.user1.password,
						persistSession: true,
						captcha: await solveCaptcha(env),
					})
					.expect(200)
					.expectCookie({
						name: "accessToken",
						options: {
							HttpOnly: true,
							"Max-Age": env.configService
								.getOrThrow("ACCESS_TOKEN_DURATION", {
									infer: true,
								})
								.toString(),
						},
					})
					.expectCookie({
						name: "refreshToken",
						options: {
							HttpOnly: true,
							"Max-Age": env.configService
								.getOrThrow("REFRESH_TOKEN_DURATION", {
									infer: true,
								})
								.toString(),
						},
					})
					.json();
				assert.strictEqual(response.body["accessToken"], undefined);
				assert.strictEqual(response.body["refreshToken"], undefined);
				assert.notStrictEqual(response.body["userId"], undefined);

				const accessToken = extractCookie(
					"accessToken",
					convertResponseCookiesToRequestCookies(response),
				);
				const tokenPayload = env.app.get(JwtService).decode(accessToken);
				const accessTokenDuration = env.configService.getOrThrow("ACCESS_TOKEN_DURATION", {
					infer: true,
				});
				assert.strictEqual(tokenPayload.exp - tokenPayload.iat, accessTokenDuration);
			});

			test("POST short-lived session 200", async () => {
				await env.request
					.post("/auth/login")
					.send({
						email: env.users.user1.api.email,
						password: env.users.user1.password,
						persistSession: false,
						captcha: await solveCaptcha(env),
					})
					.expect(200)
					.expectCookie({
						name: "refreshToken",
						options: {
							HttpOnly: true,
							"Max-Age": env.configService
								.getOrThrow("REFRESH_TOKEN_SHORT_DURATION", {
									infer: true,
								})
								.toString(),
						},
					})
					.json();
			});

			for (const { test: testName, data, status } of [
				{
					test: "POST 401 wrong password",
					status: 401,
					data: () => ({ email: env.users.user1.api.email, password: "wrong password" }),
				},
				{
					test: "POST 401 unknown email address",
					status: 401,
					data: () => ({
						email: "unknown.email@example.com",
						password: env.users.user1.password,
					}),
				},
				{
					test: "POST 400 no email provided",
					status: 400,
					data: () => ({ password: env.users.user1.password }),
				},
				{
					test: "POST 400 empty email provided",
					status: 400,
					data: () => ({ email: "", password: env.users.user1.password }),
				},
				{
					test: "POST 400 invalid email provided",
					status: 400,
					data: () => ({
						email: "not an email address",
						password: env.users.user1.password,
					}),
				},
				{
					test: "POST 400 no password provided",
					status: 400,
					data: () => ({ email: env.users.user1.api.email }),
				},
				{
					test: "POST 400 empty password",
					status: 400,
					data: () => ({ email: env.users.user1.api.email, password: "" }),
				},
			]) {
				test(testName, async () => {
					await env.request
						.post("/auth/login")
						.send({
							...data(),
							captcha: await solveCaptcha(env),
						})
						.expectNotCookie("refreshToken")
						.expect(status)
						.json();
				});
			}

			testCaptcha(
				() => env,
				200,
				(name, callback) => {
					test(name, callback);
				},
				(captcha) => {
					return env.request.post("/auth/login").send({
						email: env.users.user1.api.email,
						password: env.users.user1.password,
						captcha: captcha,
					});
				},
			);
		});

		describe("/refresh", () => {
			async function testAuthRefreshFails(user: UserAuthData, status: number) {
				const response = await env.request
					.post("/auth/refresh")
					.authenticated(user)
					.expect(status)
					.expectNotCookie("refreshToken")
					.json();
				assert.strictEqual(response.body["accessToken"], undefined);
				assert.strictEqual(response.body["refreshToken"], undefined);
			}

			test("POST 200", async () => {
				const response = await env.request
					.post("/auth/refresh")
					.authenticated(env.users.user1)
					.expect(200)
					.expectCookie({
						name: "accessToken",
						options: {
							HttpOnly: true,
							"Max-Age": env.configService
								.getOrThrow("ACCESS_TOKEN_DURATION", {
									infer: true,
								})
								.toString(),
						},
					})
					.expectCookie({
						name: "refreshToken",
						options: {
							HttpOnly: true,
							"Max-Age": env.configService
								.getOrThrow("REFRESH_TOKEN_SHORT_DURATION", {
									infer: true,
								})
								.toString(),
						},
					})
					.json();
				assert.strictEqual(response.body["accessToken"], undefined);
				assert.strictEqual(response.body["refreshToken"], undefined);

				const newCookies = convertResponseCookiesToRequestCookies(response);

				const oldAccessToken = extractCookie("accessToken", env.users.user1.cookies);
				const newAccessToken = extractCookie("accessToken", newCookies);
				assert.notStrictEqual(newAccessToken, oldAccessToken);

				const oldRefreshToken = extractCookie("refreshToken", env.users.user1.cookies);
				const newRefreshToken = extractCookie("refreshToken", newCookies);
				assert.notStrictEqual(newRefreshToken, oldRefreshToken);

				await env.request
					.get("/user/" + env.users.user1.api.id)
					.set("Cookie", newCookies)
					.expect(200)
					.execute();

				// Old refresh token must be revoked
				await testAuthRefreshFails(env.users.user1, 401);

				// New access token must work
				await env.request
					.get("/user/" + env.users.user1.api.id)
					.set("Cookie", newCookies)
					.expect(200)
					.json();

				// New refresh token must work
				await env.request
					.post("/auth/refresh")
					.set("Cookie", newCookies)
					.expect(200)
					.json();
			});

			test("POST long-lived session 200", async () => {
				const response = await env.request
					.post("/auth/login")
					.send({
						email: env.users.user1.api.email,
						password: env.users.user1.password,
						persistSession: true,
						captcha: await solveCaptcha(env),
					})
					.expect(200)
					.json();

				const cookies = convertResponseCookiesToRequestCookies(response);
				await env.request
					.post("/auth/refresh")
					.set("Cookie", cookies)
					.expect(200)
					.expectCookie({
						name: "refreshToken",
						options: {
							HttpOnly: true,
							"Max-Age": env.configService
								.getOrThrow("REFRESH_TOKEN_DURATION", {
									infer: true,
								})
								.toString(),
						},
					})
					.json();
			});

			test("POST 401 invalid refresh token", async () => {
				await testAuthRefreshFails(
					{
						cookies: "refreshToken=notavalidtoken",
					},
					401,
				);
			});

			test("POST 401 revoked refresh token", async () => {
				await env.request
					.post("/auth/logout")
					.authenticated(env.users.user1)
					.expect(200)
					.execute();
				await testAuthRefreshFails(env.users.user1, 401);
			});

			test("POST 401 expired refresh token", async () => {
				await makeRefreshTokenExpired();
				await testAuthRefreshFails(env.users.user1, 401);
			});

			test("POST 401 no refresh token provided", async () => {
				await testAuthRefreshFails(
					{
						cookies: "",
					},
					401,
				);
			});

			test("POST 401 empty refresh token", async () => {
				await testAuthRefreshFails(
					{
						cookies: "refreshToken=",
					},
					401,
				);
			});
		});

		describe("/logout", () => {
			test("POST 200", async () => {
				const response = await env.request
					.post("/auth/logout")
					.authenticated(env.users.user1)
					.expect(200)
					.expectCookieDelete("accessToken")
					.expectCookieDelete("refreshToken")
					.json();
				assert.strictEqual(response.body["accessToken"], undefined);
				assert.strictEqual(response.body["refreshToken"], undefined);

				// /auth/refresh already tested
			});

			test("POST 401 revoked token", async () => {
				// Access token works
				await env.request
					.get(`/user/${env.users.user1.api.id}`)
					.authenticated(env.users.user1)
					.expect(200)
					.json();

				const response = await env.request
					.post("/auth/logout")
					.authenticated(env.users.user1)
					.expect(200)
					.json();
				const newCookies = convertResponseCookiesToRequestCookies(response);

				// Access token removed from cookies
				await env.request
					.get(`/user/${env.users.user1.api.id}`)
					.set("Cookie", newCookies)
					.expect(401)
					.json();

				// Refresh token revoked
				await env.request
					.post("/auth/refresh")
					.authenticated(env.users.user1)
					.expect(401)
					.json();
			});

			test("POST 401 expired token", async () => {
				await makeRefreshTokenExpired();

				await env.request
					.post("/auth/logout")
					.authenticated(env.users.user1)
					.expect(401)
					.json();
			});

			test("POST 401 expired token long-lived session", async () => {
				await makeRefreshTokenExpired(true);

				await env.request
					.post("/auth/logout")
					.authenticated(env.users.user1)
					.expect(401)
					.json();
			});

			test("POST 200 session lived past short-lived ttl but not long-lived", async () => {
				await makeRefreshTokenExpired(true, true);

				await env.request
					.post("/auth/logout")
					.authenticated(env.users.user1)
					.expect(200)
					.json();
			});
		});

		test("Access tokens expire", async () => {
			await env.request
				.get("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.expect(200)
				.execute();
			const accessToken = extractCookie("accessToken", env.users.user1.cookies);
			const expiredAccessToken = await makeExpiredAccessToken(accessToken);
			const response = await env.request
				.get("/user/" + env.users.user1.api.id)
				.set("Cookie", `accessToken=${expiredAccessToken}`)
				.expect(401)
				.json();
			assert.strictEqual(response.body["name"], TOKEN_EXPIRED_ERROR);
		});
	});

	describe("/user", () => {
		test("POST 201", async () => {
			const email = createId() + "@example.com";
			const response = await env.request
				.post("/user")
				.send({
					email: email,
					password: "12345678",
					registrationPassword: env.registrationPassword,
					captcha: await solveCaptcha(env, "sendEmail", email),
				})
				.expect(201)
				.json();
			assert.deepStrictEqual(Object.keys(response.body), [
				"id",
				"domain",
				"email",
				"createdAt",
				"isEmailVerified",
				"newEmailRequest",
			]);
		});

		for (const testCase of [
			{
				test: "Invalid email",
				email: "is_not_an_email",
				password: "12345678",
				captchaCode: 400,
			},
			{ test: "Password too short", email: "john@example.com", password: "123" },
			{ test: "Missing password", email: "john@example.com" },
			{ test: "Missing email", password: "12345678", captchaCode: 400 },
		]) {
			test(`POST ${testCase.test} 400`, async () => {
				await env.request
					.post("/user")
					.send({
						registrationPassword: env.registrationPassword,
						...testCase,
						captcha: await solveCaptcha(
							env,
							"sendEmail",
							testCase.email,
							testCase.captchaCode,
						),
					})
					.expect(400)
					.json();
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
					captcha: await solveCaptcha(env, "sendEmail", email),
				})
				.expect(201)
				.execute();
			await env.request
				.post("/user")
				.send({
					email: email,
					password: "87654321",
					registrationPassword: env.registrationPassword,
					captcha: await solveCaptcha(env, "sendEmail", email),
				})
				.expect(409)
				.json();
		});

		test("POST authenticated 401", async () => {
			const email = "john@example.com";
			await env.request
				.post("/user")
				.authenticated(env.users.user1)
				.send({
					email: email,
					password: "12345678",
					registrationPassword: env.registrationPassword,
					captcha: await solveCaptcha(env, "sendEmail", email),
				})
				.expect(401)
				.json();
		});

		test("POST without general registration password 401", async () => {
			const email = "john@example.com";
			await env.request
				.post("/user")
				.send({
					email: email,
					password: "12345678",
					captcha: await solveCaptcha(env, "sendEmail", email),
				})
				.expect(401)
				.json();
		});

		testCaptcha(
			() => env,
			201,
			(name, callback) => {
				test(name, callback);
			},
			(captcha, actionValue) => {
				return env.request.post("/user").send({
					email: actionValue,
					password: "12345678",
					registrationPassword: env.registrationPassword,
					captcha,
				});
			},
			"sendEmail",
			() => createId() + "@example.com",
			createId(),
		);

		test("GET 200", async () => {
			const response = await env.request
				.get("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.expect(200)
				.json();
			const expectedDomain = env.configService
				.getOrThrow("PUBLIC_URL", { infer: true })
				.split("//", 2)[1];
			assert.deepStrictEqual(response.body, {
				id: env.users.user1.api.id,
				domain: expectedDomain,
				email: env.users.user1.api.email,
				createdAt: env.users.user1.api.createdAt.toISOString(),
				isEmailVerified: false,
				newEmailRequest: "",
			});
		});

		test("GET unauthenticated 401", async () => {
			await env.request
				.get("/user/" + env.users.user1.api.id)
				.expect(401)
				.json();
		});

		test("GET other user 401", async () => {
			await env.request
				.get("/user/" + env.users.user2.api.id)
				.authenticated(env.users.user1)
				.expect(401)
				.json();
		});

		test("PUT 404", async () => {
			const newEmail = "new.jane@example.org";
			await env.request
				.put("/user/" + env.users.user1.api.id)
				.send({ email: newEmail })
				.expect(404)
				.execute();
			const response = await env.request
				.get("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.expect(200)
				.json();
			assert.strictEqual(response.body["email"], env.users.user1.api.email);
			assert.notStrictEqual(response.body["email"], newEmail);
		});

		test("PATCH email 200", async () => {
			let dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user1.api.id,
				},
			});
			assert(dbUser);

			const emailVerificationToken = dbUser.emailVerificationToken;
			const newEmail = createId() + "@example.org";
			await env.request
				.patch("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.send({ captcha: await solveCaptcha(env, "sendEmail", newEmail), email: newEmail })
				.expect(200)
				.execute();

			dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user1.api.id,
				},
			});
			assert(dbUser);
			// Changing email should never change isEmailVerified in DB
			assert.strictEqual(dbUser.isEmailVerified, false);
			assert.notEqual(dbUser.emailVerificationToken, emailVerificationToken);
			assert.strictEqual(dbUser.emailVerificationToken.length, 64);

			let response = await env.request
				.get("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.expect(200)
				.json();
			const parsedBody = parseApiResult(GetUser, response.body);
			assert.strictEqual(parsedBody.email, env.users.user1.api.email);
			// This should *not* correspond to isEmailVerified in DB, but instead should reflect the
			//  presence of a to-be-verified new email address field
			assert.strictEqual(parsedBody.isEmailVerified, false);

			await env.request
				.post(
					"/user/" +
						env.users.user1.api.id +
						"/verify-email/" +
						dbUser.emailVerificationToken,
				)
				.expect(200)
				.execute();

			response = await env.request
				.get("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.expect(200)
				.json();
			assert.strictEqual(response.body["email"], newEmail);
			assert.notStrictEqual(response.body["email"], env.users.user1.api.email);
		});

		test("PATCH email doesn't set isEmailVerified back to false in DB 200", async () => {
			await verifyUser1Email(env);

			let dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user1.api.id,
				},
			});
			assert(dbUser);
			assert.strictEqual(dbUser.isEmailVerified, true);

			const email = createId() + "@example.org";
			await env.request
				.patch("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.send({ captcha: await solveCaptcha(env, "sendEmail", email), email: email })
				.expect(200)
				.execute();

			dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user1.api.id,
				},
			});
			assert(dbUser);
			// Changing email should never set isEmailVerified back to false in DB
			assert.strictEqual(dbUser.isEmailVerified, true);
		});

		test("PATCH email sets newEmailRequest in GET /user/:id 200", async () => {
			await verifyUser1Email(env);

			let apiGetUser = parseApiResult(
				GetUser,
				(
					await env.request
						.get("/user/" + env.users.user1.api.id)
						.authenticated(env.users.user1)
						.expect(200)
						.json()
				).body,
			);
			assert.strictEqual(apiGetUser.newEmailRequest, "");

			const newEmail = createId() + "@example.org";
			await env.request
				.patch("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.send({ captcha: await solveCaptcha(env, "sendEmail", newEmail), email: newEmail })
				.expect(200)
				.execute();

			apiGetUser = parseApiResult(
				GetUser,
				(
					await env.request
						.get("/user/" + env.users.user1.api.id)
						.authenticated(env.users.user1)
						.expect(200)
						.json()
				).body,
			);
			assert.strictEqual(apiGetUser.newEmailRequest, newEmail);
		});

		test("PATCH email twice without verifying 200", async () => {
			for (let i = 0; i < 2; i++) {
				const email = createId() + "@example.com";
				await env.request
					.patch("/user/" + env.users.user1.api.id)
					.authenticated(env.users.user1)
					.send({ captcha: await solveCaptcha(env, "sendEmail", email), email: email })
					.expect(200)
					.execute();
			}
		});

		test("PATCH email to existing email 409", async () => {
			await env.request
				.patch("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user2.api.email),
					email: env.users.user2.api.email,
				})
				.expect(409)
				.execute();
		});

		test("PATCH email same email for 2 users 409", async () => {
			const newEmail = createId() + "@example.org";
			await env.request
				.patch("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.send({ captcha: await solveCaptcha(env, "sendEmail", newEmail), email: newEmail })
				.expect(200)
				.execute();
			await env.request
				.patch("/user/" + env.users.user2.api.id)
				.authenticated(env.users.user2)
				.send({ captcha: await solveCaptcha(env, "sendEmail", newEmail), email: newEmail })
				.expect(200)
				.execute();

			// Verify user 1 succeeds
			let dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user1.api.id,
				},
			});
			assert(dbUser);
			await env.request
				.post("/user/" + dbUser.id + "/verify-email/" + dbUser.emailVerificationToken)
				.expect(200)
				.execute();

			// Verify user 2 fails
			dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user2.api.id,
				},
			});
			assert(dbUser);
			await env.request
				.post("/user/" + dbUser.id + "/verify-email/" + dbUser.emailVerificationToken)
				.expect(409)
				.execute();
		});

		testCaptcha(
			() => env,
			200,
			(testName, testCallback) => {
				test(testName, testCallback);
			},
			(captcha, actionValue) => {
				return env.request
					.patch("/user/" + env.users.user1.api.id)
					.authenticated(env.users.user1)
					.send({ captcha, email: actionValue });
			},
			"sendEmail",
			() => createId() + "@example.org",
			createId(),
		);

		test("PATCH unauthenticated 401", async () => {
			const newEmail = "new.jane@example.org";
			await env.request
				.patch("/user/" + env.users.user1.api.id)
				.send({ captcha: await solveCaptcha(env, "sendEmail", newEmail), email: newEmail })
				.expect(401)
				.json();
		});

		test("PATCH other user 401", async () => {
			const newEmail = "new.jane@example.org";
			await env.request
				.patch("/user/" + env.users.user2.api.id)
				.authenticated(env.users.user1)
				.send({ captcha: await solveCaptcha(env, "sendEmail", newEmail), email: newEmail })
				.expect(401)
				.json();
		});

		test("PATCH bad email 400", async () => {
			const newEmail = "not an email address";
			await env.request
				.patch("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", newEmail, 400),
					email: newEmail,
				})
				.expect(400)
				.execute();
			await env.request
				.patch("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env),
					email: newEmail,
				})
				.expect(400)
				.execute();
			const response = await env.request
				.get("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.authenticated(env.users.user1)
				.expect(200)
				.json();
			assert.strictEqual(response.body["email"], env.users.user1.api.email);
			assert.notStrictEqual(response.body["email"], newEmail);
		});

		test("PATCH password 200", async () => {
			const oldPassword = env.users.user1.password;
			const newPassword = "87654321";
			await env.request
				.patch("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.send({ captcha: await solveCaptcha(env), oldPassword, newPassword })
				.expect(200)
				.execute();
		});

		test("PATCH missing oldPassword 400", async () => {
			await env.request
				.patch("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.send({ captcha: await solveCaptcha(env), newPassword: "87654321" })
				.expect(400)
				.execute();
		});

		test("PATCH missing newPassword 400", async () => {
			await env.request
				.patch("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env),
					oldPassword: env.users.user1.password,
				})
				.expect(400)
				.execute();
		});

		test("PATCH wrong old password 401", async () => {
			const oldPassword = "wrong old password";
			const newPassword = "87654321";
			await env.request
				.patch("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.send({ captcha: await solveCaptcha(env), oldPassword, newPassword })
				.expect(401)
				.execute();
		});

		test("PATCH bad new password 400", async () => {
			const oldPassword = env.users.user1.password;
			const newPassword = "short"; // Less than 8 characters
			await env.request
				.patch("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.send({ captcha: await solveCaptcha(env), oldPassword, newPassword })
				.expect(400)
				.execute();
		});

		test("PATCH empty 400", async () => {
			await env.request
				.patch("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.send({ captcha: await solveCaptcha(env) })
				.expect(400)
				.execute();
		});

		test("DELETE 200", async () => {
			await env.request
				.delete("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.expect(200)
				.execute();
			await env.request
				.get("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.expect(404)
				.execute();
		});

		test("DELETE unauthenticated fails", async () => {
			await env.request
				.delete("/user/" + env.users.user1.api.id)
				.expect(401)
				.json();
		});

		test("DELETE other user 401", async () => {
			await env.request
				.delete("/user/" + env.users.user2.api.id)
				.authenticated(env.users.user1)
				.expect(401)
				.json();
		});
	});
});

import { JwtService } from "@nestjs/jwt";
import { eq } from "drizzle-orm";
import assert from "node:assert";
import test, { describe } from "node:test";
import { TOKEN_EXPIRED_ERROR } from "openselves-common";
import type { SubspaceId } from "openselves-common/willow";

import { sessions } from "../src/db/index.js";
import type { UserAuthData } from "./TestQueryBuilder.js";
import { getSyncFrom } from "./sync-utils.js";
import {
	type TestEnvWithUsers,
	convertResponseCookiesToRequestCookies,
	extractCookie,
	setupTestSuiteWithUsers,
	solveCaptcha,
	testCaptcha,
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

	async function testUserIsAuthenticated(
		user: UserAuthData = env.users.user1,
		subspaceId: SubspaceId = env.users.user1.keys.publicKey,
		expectCode: number = 200,
	) {
		return await getSyncFrom(env, "", subspaceId, user, expectCode);
	}

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
						subspaceIds: [env.users.user1.keys.publicKey.toBase64()],
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
						subspaceIds: [env.users.user1.keys.publicKey.toBase64()],
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

			// TODO: meadowcap
			// for (const { test: testName, data, status } of [
			// ]) {
			// 	test(testName, async () => {
			// 		await env.request
			// 			.post("/auth/login")
			// 			.send({
			// 				...data(),
			// 				captcha: await solveCaptcha(env),
			// 			})
			// 			.expectNotCookie("refreshToken")
			// 			.expect(status)
			// 			.json();
			// 	});
			// }

			testCaptcha(
				() => env,
				200,
				(name, callback) => {
					test(name, callback);
				},
				(captcha) => {
					return env.request.post("/auth/login").send({
						subspaceIds: [env.users.user1.keys.publicKey.toBase64()],
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

				// New access token must work
				await testUserIsAuthenticated({ cookies: newCookies });

				// Old refresh token must be revoked
				await testAuthRefreshFails(env.users.user1, 401);

				// New access token must still work
				await testUserIsAuthenticated({ cookies: newCookies });

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
						subspaceIds: [env.users.user1.keys.publicKey.toBase64()],
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
				await testUserIsAuthenticated();

				const response = await env.request
					.post("/auth/logout")
					.authenticated(env.users.user1)
					.expect(200)
					.json();
				const newCookies = convertResponseCookiesToRequestCookies(response);

				// Access token removed from cookies
				await testUserIsAuthenticated({ cookies: newCookies }, undefined, 401);

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
			await testUserIsAuthenticated();
			const accessToken = extractCookie("accessToken", env.users.user1.cookies);
			const expiredAccessToken = await makeExpiredAccessToken(accessToken);
			const { response } = await testUserIsAuthenticated(
				{
					cookies: `accessToken=${expiredAccessToken}`,
				},
				undefined,
				401,
			);
			assert(response.body);
			assert.strictEqual(response.body["name"], TOKEN_EXPIRED_ERROR);
		});
	});
});

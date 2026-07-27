import { JwtService } from "@nestjs/jwt";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import assert from "node:assert";
import test, { describe } from "node:test";
import { TOKEN_EXPIRED_ERROR } from "openselves-common";
import { ByteString, Ed25519, UserPublicKey } from "openselves-common/willow";

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
		user: UserAuthData & { keys: { publicKey: UserPublicKey } } = env.users.user1,
		expectCode: number = 200,
	) {
		return await getSyncFrom(env, "", user, expectCode);
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
		describe("/challenge", () => {
			test("POST returns a string payload 200", async () => {
				const response = await env.request
					.post("/auth/challenge")
					.send({
						userKey: env.users.user1.keys.publicKey.toBase64(),
						captcha: await solveCaptcha(env),
					})
					.expect(200)
					.json();
				assert("challenge" in response.body);
				assert.strictEqual(typeof response.body.challenge, "string");
			});

			test("POST returns a different payload every time", async () => {
				const response1 = await env.request
					.post("/auth/challenge")
					.send({
						userKey: env.users.user1.keys.publicKey.toBase64(),
						captcha: await solveCaptcha(env),
					})
					.expect(200)
					.json();
				const response2 = await env.request
					.post("/auth/challenge")
					.send({
						userKey: env.users.user1.keys.publicKey.toBase64(),
						captcha: await solveCaptcha(env),
					})
					.expect(200)
					.json();
				assert("challenge" in response1.body);
				assert.strictEqual(typeof response1.body.challenge, "string");
				assert.notStrictEqual(response1.body["challenge"], response2.body["challenge"]);
			});

			test("POST invalid userKey", async () => {
				await env.request
					.post("/auth/challenge")
					.send({
						userKey: ByteString.fromUtf8("not valid").toBase64(),
						captcha: await solveCaptcha(env),
					})
					.expect(400)
					.json();
			});

			testCaptcha(
				() => env,
				200,
				(name, callback) => {
					test(name, callback);
				},
				(captcha) => {
					return env.request.post("/auth/challenge").send({
						userKey: env.users.user1.keys.publicKey.toBase64(),
						captcha: captcha,
					});
				},
			);
		});

		describe("/login", () => {
			test("POST 200", async () => {
				const response = await env.request
					.post("/auth/login")
					.send({
						...(await env.getValidAuthLoginParameters()),
						persistSession: true,
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
						...(await env.getValidAuthLoginParameters()),
						persistSession: false,
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

			test("POST invalid challenge", async () => {
				const params = await env.getValidAuthLoginParameters();

				// Invalid challenge
				params.challenge = createId();
				params.signature = (
					await Ed25519.sign(
						env.users.user1.keys.secretKey,
						ByteString.fromUtf8(params.challenge),
					)
				).toBase64();

				await env.request
					.post("/auth/login")
					.send({
						...params,
						persistSession: false,
					})
					.expect(401)
					.expectNotCookie("refreshToken")
					.expectNotCookie("accessToken")
					.json();
			});

			test("POST invalid signature", async () => {
				const params = await env.getValidAuthLoginParameters();

				// Sign something else
				params.signature = (
					await Ed25519.sign(
						env.users.user1.keys.secretKey,
						ByteString.fromUtf8(createId()),
					)
				).toBase64();

				await env.request
					.post("/auth/login")
					.send({
						...params,
						persistSession: false,
					})
					.expect(401)
					.expectNotCookie("refreshToken")
					.expectNotCookie("accessToken")
					.json();
			});

			test("POST expired challenge", async () => {
				const params = await env.getValidAuthLoginParameters();

				// This duration is set to 5s for tests in package.json
				await waitFor(5000);

				await env.request
					.post("/auth/login")
					.send({
						...params,
						persistSession: false,
					})
					.expect(401)
					.expectNotCookie("refreshToken")
					.expectNotCookie("accessToken")
					.json();
			});
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
				await testUserIsAuthenticated({ cookies: newCookies, keys: env.users.user1.keys });

				// Old refresh token must be revoked
				await testAuthRefreshFails(env.users.user1, 401);

				// New access token must still work
				await testUserIsAuthenticated({ cookies: newCookies, keys: env.users.user1.keys });

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
						...(await env.getValidAuthLoginParameters()),
						persistSession: true,
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
				await testUserIsAuthenticated(
					{ cookies: newCookies, keys: env.users.user1.keys },
					401,
				);

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
					keys: env.users.user1.keys,
				},
				401,
			);
			assert(response.body);
			assert.strictEqual(response.body["name"], TOKEN_EXPIRED_ERROR);
		});
	});
});

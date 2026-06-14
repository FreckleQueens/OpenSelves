import assert from "node:assert";
import test, { describe } from "node:test";

import { QueueService } from "../src/queue/queue.service.js";
import {
	type TestEnvWithUsers,
	generateDummyToken,
	setupTestSuiteWithUsers,
	solveCaptcha,
	testCaptcha,
} from "./utils.js";

describe("Email verification", () => {
	let env: TestEnvWithUsers;

	setupTestSuiteWithUsers(
		(testEnv) => {
			env = testEnv;
		},
		undefined,
		true,
	);

	describe("/user", () => {
		test("GET has field isEmailVerified=false 200", async () => {
			const response = await env.request
				.get("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.expect(200);
			assert.partialDeepStrictEqual(response.body, {
				isEmailVerified: false,
			});
			assert(!response.body["emailVerificationToken"]);
		});
	});

	describe("/user/:id/verify-email/:token", () => {
		test("POST verifies user email 200", async () => {
			const dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user.id,
				},
			});
			assert(dbUser);
			assert("emailVerificationToken" in dbUser);
			assert(dbUser.emailVerificationToken);

			await env.request
				.post(
					"/user/" + env.users.user.id + "/verify-email/" + dbUser.emailVerificationToken,
				)
				.expect(200);

			const userResponse = await env.request
				.get("/user/" + env.users.user.id)
				.set("Cookie", env.users.cookies)
				.expect(200);
			assert.partialDeepStrictEqual(userResponse.body, {
				isEmailVerified: true,
			});
		});

		test("POST bad token length 400", async () => {
			await env.request
				.post("/user/" + env.users.user.id + "/verify-email/badtokenlength")
				.expect(400);
		});

		test("POST wrong token 404", async () => {
			const invalidToken = generateDummyToken();
			await env.request
				.post("/user/" + env.users.user.id + "/verify-email/" + invalidToken)
				.expect(404);
		});

		test("POST wrong user 404", async () => {
			const dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user.id,
				},
			});
			assert(dbUser);
			await env.request
				.post(
					"/user/" +
						dbUser.id.split("").reverse().join("") +
						"/verify-email/" +
						dbUser.emailVerificationToken,
				)
				.expect(404);
		});

		test("POST doesn't modify the user the second time 200", async () => {
			const dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user.id,
				},
			});
			assert(dbUser);

			await env.request.post(
				"/user/" + env.users.user.id + "/verify-email/" + dbUser.emailVerificationToken,
			);

			const dbUser1 = await env.db.query.users.findFirst({
				where: {
					id: env.users.user.id,
				},
			});
			assert(dbUser1);

			// Make sure the second request doesn't happen in the same millisecond
			await new Promise((resolve) => setTimeout(resolve, 1));
			await env.request
				.post(
					"/user/" + env.users.user.id + "/verify-email/" + dbUser.emailVerificationToken,
				)
				.expect(200);

			const dbUser2 = await env.db.query.users.findFirst({
				where: {
					id: env.users.user.id,
				},
			});
			assert(dbUser2);

			assert.strictEqual(dbUser1.updatedAt.getTime(), dbUser2.updatedAt.getTime());
		});
	});

	describe("/user/:id/resend-verification-email", () => {
		test("POST 200", async () => {
			await env.request
				.post(`/user/${env.users.user.id}/resend-verification-email`)
				.set("Cookie", env.users.cookies)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
				})
				.expect(200);
		});

		test("POST wrong user 403", async () => {
			await env.request
				.post(`/user/${env.users.user2.id}/resend-verification-email`)
				.set("Cookie", env.users.cookies)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user2.email),
				})
				.expect(403);
		});

		test("POST twice in a row 429", async () => {
			await env.request
				.post(`/user/${env.users.user.id}/resend-verification-email`)
				.set("Cookie", env.users.cookies)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
				})
				.expect(200);
			await env.request
				.post(`/user/${env.users.user.id}/resend-verification-email`)
				.set("Cookie", env.users.cookies)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
				})
				.expect(429);
		});

		test("POST once, flush, once 429", async () => {
			await env.request
				.post(`/user/${env.users.user.id}/resend-verification-email`)
				.set("Cookie", env.users.cookies)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
				})
				.expect(200);
			await env.app.get(QueueService).flushJobs();
			await env.request
				.post(`/user/${env.users.user.id}/resend-verification-email`)
				.set("Cookie", env.users.cookies)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
				})
				.expect(429);
		});

		test("POST twice with different users 200", async () => {
			await env.request
				.post(`/user/${env.users.user.id}/resend-verification-email`)
				.set("Cookie", env.users.cookies)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
				})
				.expect(200);
			await env.request
				.post(`/user/${env.users.user2.id}/resend-verification-email`)
				.set("Cookie", env.users.cookies2)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user2.email),
				})
				.expect(200);
		});

		test("POST already verified 403", async () => {
			const dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user.id,
				},
			});
			assert(dbUser);
			await env.request
				.post(
					"/user/" + env.users.user.id + "/verify-email/" + dbUser.emailVerificationToken,
				)
				.expect(200);
			await env.request
				.post(`/user/${env.users.user.id}/resend-verification-email`)
				.set("Cookie", env.users.cookies)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
				})
				.expect(200);
		});

		testCaptcha(
			() => env,
			200,
			(testName, testCallback) => {
				test(testName, testCallback);
			},
			async (captcha) => {
				return env.request
					.post(`/user/${env.users.user.id}/resend-verification-email`)
					.set("Cookie", env.users.cookies)
					.send({
						captcha,
					});
			},
			"sendEmail",
			() => env.users.user.email,
			undefined,
			true,
		);
	});
});

import assert from "node:assert";
import test, { describe } from "node:test";

import { QueueService } from "../src/queue/queue.service.js";
import {
	type TestEnvWithUsers,
	generateDummyToken,
	setupTestSuiteWithUsers,
	solveCaptcha,
	testCaptcha,
	verifyUser1Email,
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
				.get("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.expect(200)
				.json();
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
					id: env.users.user1.api.id,
				},
			});
			assert(dbUser);
			assert("emailVerificationToken" in dbUser);
			assert(dbUser.emailVerificationToken);

			await env.request
				.post(
					"/user/" +
						env.users.user1.api.id +
						"/verify-email/" +
						dbUser.emailVerificationToken,
				)
				.expect(200)
				.execute();

			const userResponse = await env.request
				.get("/user/" + env.users.user1.api.id)
				.authenticated(env.users.user1)
				.expect(200)
				.json();
			assert.partialDeepStrictEqual(userResponse.body, {
				isEmailVerified: true,
			});
		});

		test("POST bad token length 400", async () => {
			await env.request
				.post("/user/" + env.users.user1.api.id + "/verify-email/badtokenlength")
				.expect(400)
				.execute();
		});

		test("POST wrong token 404", async () => {
			const invalidToken = generateDummyToken();
			await env.request
				.post("/user/" + env.users.user1.api.id + "/verify-email/" + invalidToken)
				.expect(404)
				.execute();
		});

		test("POST wrong user 404", async () => {
			const dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user1.api.id,
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
				.expect(404)
				.execute();
		});

		test("POST doesn't modify the user the second time 200", async () => {
			const dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user1.api.id,
				},
			});
			assert(dbUser);

			await env.request
				.post(
					"/user/" +
						env.users.user1.api.id +
						"/verify-email/" +
						dbUser.emailVerificationToken,
				)
				.execute();

			const dbUser1 = await env.db.query.users.findFirst({
				where: {
					id: env.users.user1.api.id,
				},
			});
			assert(dbUser1);

			// Make sure the second request doesn't happen in the same millisecond
			await new Promise((resolve) => setTimeout(resolve, 1));
			await env.request
				.post(
					"/user/" +
						env.users.user1.api.id +
						"/verify-email/" +
						dbUser.emailVerificationToken,
				)
				.expect(200)
				.execute();

			const dbUser2 = await env.db.query.users.findFirst({
				where: {
					id: env.users.user1.api.id,
				},
			});
			assert(dbUser2);

			assert.strictEqual(dbUser1.updatedAt.getTime(), dbUser2.updatedAt.getTime());
		});
	});

	describe("/user/:id/resend-verification-email", () => {
		test("POST 200", async () => {
			await env.request
				.post(`/user/${env.users.user1.api.id}/resend-verification-email`)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
				})
				.expect(200)
				.execute();
		});

		test("POST wrong user 403", async () => {
			await env.request
				.post(`/user/${env.users.user2.api.id}/resend-verification-email`)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user2.api.email),
				})
				.expect(403)
				.execute();
		});

		test("POST twice in a row 429", async () => {
			await env.request
				.post(`/user/${env.users.user1.api.id}/resend-verification-email`)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
				})
				.expect(200)
				.execute();
			await env.request
				.post(`/user/${env.users.user1.api.id}/resend-verification-email`)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
				})
				.expect(429)
				.execute();
		});

		test("POST once, flush, once 429", async () => {
			await env.request
				.post(`/user/${env.users.user1.api.id}/resend-verification-email`)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
				})
				.expect(200)
				.execute();
			await env.app.get(QueueService).flushJobs();
			await env.request
				.post(`/user/${env.users.user1.api.id}/resend-verification-email`)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
				})
				.expect(429)
				.execute();
		});

		test("POST twice with different users 200", async () => {
			await env.request
				.post(`/user/${env.users.user1.api.id}/resend-verification-email`)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
				})
				.expect(200)
				.execute();
			await env.request
				.post(`/user/${env.users.user2.api.id}/resend-verification-email`)
				.set("Cookie", env.users.user2.cookies)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user2.api.email),
				})
				.expect(200)
				.execute();
		});

		test("POST already verified 403", async () => {
			await verifyUser1Email(env);
			await env.request
				.post(`/user/${env.users.user1.api.id}/resend-verification-email`)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
				})
				.expect(200)
				.execute();
		});

		testCaptcha(
			() => env,
			200,
			(testName, testCallback) => {
				test(testName, testCallback);
			},
			(captcha) => {
				return env.request
					.post(`/user/${env.users.user1.api.id}/resend-verification-email`)
					.authenticated(env.users.user1)
					.send({
						captcha,
					});
			},
			"sendEmail",
			() => env.users.user1.api.email,
			undefined,
			true,
		);
	});
});

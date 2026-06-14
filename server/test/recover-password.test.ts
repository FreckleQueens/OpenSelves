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

describe("Password recovery", () => {
	let env: TestEnvWithUsers;

	setupTestSuiteWithUsers(
		(testEnv) => {
			env = testEnv;
		},
		undefined,
		true,
	);

	describe("/user/recover-password", () => {
		test("POST sends password recovery email 200", async () => {
			let dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user.id,
				},
			});
			assert(dbUser);
			assert("passwordRecoveryToken" in dbUser);
			assert.strictEqual(dbUser["passwordRecoveryToken"], null);

			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
					email: env.users.user.email,
				})
				.expect(200);

			dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user.id,
				},
			});
			assert(dbUser);
			assert("passwordRecoveryToken" in dbUser);
			assert(typeof dbUser["passwordRecoveryToken"] === "string");
			assert.strictEqual(dbUser["passwordRecoveryToken"].length, 64);
		});

		test("POST missing email field 400", async () => {
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
				})
				.expect(400);
		});

		test("POST not a valid email 400", async () => {
			const email = "notavalidemail";
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", email, 400),
					email: email,
				})
				.expect(400);
		});

		test("POST wrong email 404", async () => {
			const email = "doesnotexist@example.com";
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", email),
					email: email,
				})
				.expect(404);
		});

		test("POST twice the same email 429", async () => {
			const email = "doesnotexist2@example.com";
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", email),
					email: email,
				})
				.expect(404);
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", email),
					email: email,
				})
				.expect(429);
		});

		test("POST once, flush, once 429", async () => {
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
					email: env.users.user.email,
				})
				.expect(200);
			await env.app.get(QueueService).flushJobs();
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
					email: env.users.user.email,
				})
				.expect(429);
		});

		test("POST twice with different users 200", async () => {
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
					email: env.users.user.email,
				})
				.expect(200);
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user2.email),
					email: env.users.user2.email,
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
					.post("/user/recover-password")
					.send({ captcha, email: env.users.user.email });
			},
			"sendEmail",
			() => env.users.user.email,
			undefined,
			true,
		);
	});

	describe("/user/:id/recover-password", () => {
		test("POST 200", async () => {
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
					email: env.users.user.email,
				})
				.expect(200);

			let dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user.id,
				},
			});
			assert(dbUser);

			const newPassword = "anewpassword1234";
			await env.request
				.post(`/user/${env.users.user.id}/recover-password`)
				.set("Cookie", env.users.cookies)
				.send({
					token: dbUser["passwordRecoveryToken"],
					newPassword,
				})
				.expect(200);

			dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user.id,
				},
			});
			assert(dbUser);
			assert.strictEqual(dbUser["passwordRecoveryToken"], null);

			await env.request
				.post("/auth/login")
				.send({
					captcha: await solveCaptcha(env),
					email: env.users.user.email,
					password: env.users.userPassword,
				})
				.expect(401);

			await env.request
				.post("/auth/login")
				.send({
					captcha: await solveCaptcha(env),
					email: env.users.user.email,
					password: newPassword,
				})
				.expect(200);
		});

		test("POST wrong user 404", async () => {
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
					email: env.users.user.email,
				})
				.expect(200);

			const dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user.id,
				},
			});
			assert(dbUser);

			await env.request
				.post(`/user/${env.users.user2.id}/recover-password`)
				.set("Cookie", env.users.cookies)
				.send({
					captcha: await solveCaptcha(env),
					token: dbUser["passwordRecoveryToken"],
					newPassword: "anewpassword1234",
				})
				.expect(404);
		});

		test("POST wrong token 404", async () => {
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
					email: env.users.user.email,
				})
				.expect(200);

			await env.request
				.post(`/user/${env.users.user.id}/recover-password`)
				.set("Cookie", env.users.cookies)
				.send({
					captcha: await solveCaptcha(env),
					token: generateDummyToken(),
					newPassword: "anewpassword1234",
				})
				.expect(404);
		});

		test("POST no prior password recovery request 404", async () => {
			await env.request
				.post(`/user/${env.users.user.id}/recover-password`)
				.set("Cookie", env.users.cookies)
				.send({
					captcha: await solveCaptcha(env),
					token: generateDummyToken(),
					newPassword: "anewpassword1234",
				})
				.expect(404);
		});

		test("POST already used token 404", async () => {
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user.email),
					email: env.users.user.email,
				})
				.expect(200);

			const dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user.id,
				},
			});
			assert(dbUser);

			await env.request
				.post(`/user/${env.users.user.id}/recover-password`)
				.set("Cookie", env.users.cookies)
				.send({
					captcha: await solveCaptcha(env),
					token: dbUser["passwordRecoveryToken"],
					newPassword: "anewpassword1234",
				})
				.expect(200);

			await env.request
				.post(`/user/${env.users.user.id}/recover-password`)
				.set("Cookie", env.users.cookies)
				.send({
					captcha: await solveCaptcha(env),
					token: dbUser["passwordRecoveryToken"],
					newPassword: "anothernewpassword12345",
				})
				.expect(404);
		});
	});
});

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
					id: env.users.user1.api.id,
				},
			});
			assert(dbUser);
			assert("passwordRecoveryToken" in dbUser);
			assert.strictEqual(dbUser["passwordRecoveryToken"], null);

			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
					email: env.users.user1.api.email,
				})
				.expect(200)
				.execute();

			dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user1.api.id,
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
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
				})
				.expect(400)
				.execute();
		});

		test("POST not a valid email 400", async () => {
			const email = "notavalidemail";
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", email, 400),
					email: email,
				})
				.expect(400)
				.execute();
		});

		test("POST wrong email 404", async () => {
			const email = "doesnotexist@example.com";
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", email),
					email: email,
				})
				.expect(404)
				.execute();
		});

		test("POST twice the same email 429", async () => {
			const email = "doesnotexist2@example.com";
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", email),
					email: email,
				})
				.expect(404)
				.execute();
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", email),
					email: email,
				})
				.expect(429)
				.execute();
		});

		test("POST once, flush, once 429", async () => {
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
					email: env.users.user1.api.email,
				})
				.expect(200)
				.execute();
			await env.app.get(QueueService).flushJobs();
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
					email: env.users.user1.api.email,
				})
				.expect(429)
				.execute();
		});

		test("POST twice with different users 200", async () => {
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
					email: env.users.user1.api.email,
				})
				.expect(200)
				.execute();
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user2.api.email),
					email: env.users.user2.api.email,
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
					.post("/user/recover-password")
					.send({ captcha, email: env.users.user1.api.email });
			},
			"sendEmail",
			() => env.users.user1.api.email,
			undefined,
			true,
		);
	});

	describe("/user/:id/recover-password", () => {
		test("POST 200", async () => {
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
					email: env.users.user1.api.email,
				})
				.expect(200)
				.execute();

			let dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user1.api.id,
				},
			});
			assert(dbUser);

			const newPassword = "anewpassword1234";
			await env.request
				.post(`/user/${env.users.user1.api.id}/recover-password`)
				.authenticated(env.users.user1)
				.send({
					token: dbUser["passwordRecoveryToken"],
					newPassword,
				})
				.expect(200)
				.execute();

			dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user1.api.id,
				},
			});
			assert(dbUser);
			assert.strictEqual(dbUser["passwordRecoveryToken"], null);

			await env.request
				.post("/auth/login")
				.send({
					captcha: await solveCaptcha(env),
					email: env.users.user1.api.email,
					password: env.users.user1.password,
				})
				.expect(401)
				.execute();

			await env.request
				.post("/auth/login")
				.send({
					captcha: await solveCaptcha(env),
					email: env.users.user1.api.email,
					password: newPassword,
				})
				.expect(200)
				.execute();
		});

		test("POST wrong user 404", async () => {
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
					email: env.users.user1.api.email,
				})
				.expect(200)
				.execute();

			const dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user1.api.id,
				},
			});
			assert(dbUser);

			await env.request
				.post(`/user/${env.users.user2.api.id}/recover-password`)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env),
					token: dbUser["passwordRecoveryToken"],
					newPassword: "anewpassword1234",
				})
				.expect(404)
				.execute();
		});

		test("POST wrong token 404", async () => {
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
					email: env.users.user1.api.email,
				})
				.expect(200)
				.execute();

			await env.request
				.post(`/user/${env.users.user1.api.id}/recover-password`)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env),
					token: generateDummyToken(),
					newPassword: "anewpassword1234",
				})
				.expect(404)
				.execute();
		});

		test("POST no prior password recovery request 404", async () => {
			await env.request
				.post(`/user/${env.users.user1.api.id}/recover-password`)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env),
					token: generateDummyToken(),
					newPassword: "anewpassword1234",
				})
				.expect(404)
				.execute();
		});

		test("POST already used token 404", async () => {
			await env.request
				.post("/user/recover-password")
				.send({
					captcha: await solveCaptcha(env, "sendEmail", env.users.user1.api.email),
					email: env.users.user1.api.email,
				})
				.expect(200)
				.execute();

			const dbUser = await env.db.query.users.findFirst({
				where: {
					id: env.users.user1.api.id,
				},
			});
			assert(dbUser);

			await env.request
				.post(`/user/${env.users.user1.api.id}/recover-password`)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env),
					token: dbUser["passwordRecoveryToken"],
					newPassword: "anewpassword1234",
				})
				.expect(200)
				.execute();

			await env.request
				.post(`/user/${env.users.user1.api.id}/recover-password`)
				.authenticated(env.users.user1)
				.send({
					captcha: await solveCaptcha(env),
					token: dbUser["passwordRecoveryToken"],
					newPassword: "anothernewpassword12345",
				})
				.expect(404)
				.execute();
		});
	});
});

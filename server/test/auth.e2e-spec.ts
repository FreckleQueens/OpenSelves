import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";

import { AppModule } from "../src/app.module";
import { User } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma.service";

describe("AppController (e2e)", () => {
	let app: INestApplication<App>;
	let server: App;

	let user: Omit<User, "passwordHash">;
	let accessToken: string;
	const userPassword = "12345678";

	let user2: Omit<User, "passwordHash">;

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(
			new ValidationPipe({
				transform: true,
			}),
		);
		await app.init();
		server = app.getHttpServer();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(async () => {
		await app.get(PrismaService).user.deleteMany({});
		user = (
			await request(server)
				.post("/user")
				.send({ email: "jane@example.com", password: userPassword })
				.expect(201)
		).body;
		accessToken = (
			await request(server)
				.post("/auth/login")
				.send({ email: user.email, password: userPassword })
				.expect(200)
		).body.accessToken;

		user2 = (
			await request(server)
				.post("/user")
				.send({ email: "bob@example.com", password: userPassword })
				.expect(201)
		).body;
	});

	describe("/auth", () => {
		test("/auth/login (POST)", async () => {
			const response = await request(server)
				.post("/auth/login")
				.send({ email: user.email, password: userPassword })
				.expect(200)
				.expect("Content-Type", /json/);
			expect(response.body.accessToken).toBeDefined();
			expect(response.body.accessToken.length).toBeGreaterThan(0);

			await request(server)
				.post("/auth/login")
				.send({ email: user.email, password: "wrong password" })
				.expect(401)
				.expect("Content-Type", /json/);
			await request(server)
				.post("/auth/login")
				.send({ email: user.email })
				.expect(400)
				.expect("Content-Type", /json/);
			await request(server)
				.post("/auth/login")
				.send({ email: "wrong.email@example.com", password: userPassword })
				.expect(401)
				.expect("Content-Type", /json/);
			await request(server)
				.post("/auth/login")
				.send({ password: userPassword })
				.expect(400)
				.expect("Content-Type", /json/);
		});
	});

	describe("/user", () => {
		test("POST 201", async () => {
			const response = await request(server)
				.post("/user")
				.send({ email: "john@example.com", password: "12345678" })
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
					.send(testCase)
					.expect(400)
					.expect("Content-Type", /json/);
			});
		}

		test("POST authenticated 401", async () => {
			await request(server)
				.post("/user")
				.set("Authorization", `Bearer ${accessToken}`)
				.send({ email: "john@example.com", password: "12345678" })
				.expect(401)
				.expect("Content-Type", /json/);
		});

		test("GET 200", async () => {
			const response = await request(server)
				.get("/user/" + user.id)
				.set("Authorization", `Bearer ${accessToken}`)
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
				.set("Authorization", `Bearer ${accessToken}`)
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
				.set("Authorization", `Bearer ${accessToken}`)
				.expect(200);
			expect(response.body.email).toBe(user.email);
			expect(response.body.email).not.toBe(newEmail);
		});

		test("PATCH email 200", async () => {
			const newEmail = "new.jane@example.org";

			await request(server)
				.patch("/user/" + user.id)
				.set("Authorization", `Bearer ${accessToken}`)
				.send({ email: newEmail })
				.expect(200);
			const response = await request(server)
				.get("/user/" + user.id)
				.set("Authorization", `Bearer ${accessToken}`)
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
				.set("Authorization", `Bearer ${accessToken}`)
				.send({ email: newEmail })
				.expect(401)
				.expect("Content-Type", /json/);
		});

		test("PATCH bad email 400", async () => {
			const newEmail = "not an email address";
			await request(server)
				.patch("/user/" + user.id)
				.set("Authorization", `Bearer ${accessToken}`)
				.send({ email: newEmail })
				.expect(400);
			const response = await request(server)
				.get("/user/" + user.id)
				.set("Authorization", `Bearer ${accessToken}`)
				.expect(200);
			expect(response.body.email).toBe(user.email);
			expect(response.body.email).not.toBe(newEmail);
		});

		test("PATCH password 200", async () => {
			const oldPassword = userPassword;
			const newPassword = "87654321";
			await request(server)
				.patch("/user/" + user.id)
				.set("Authorization", `Bearer ${accessToken}`)
				.send({ oldPassword, newPassword })
				.expect(200);
		});

		test("PATCH missing oldPassword 400", async () => {
			await request(server)
				.patch("/user/" + user.id)
				.set("Authorization", `Bearer ${accessToken}`)
				.send({ newPassword: "87654321" })
				.expect(400);
		});

		test("PATCH missing newPassword 400", async () => {
			await request(server)
				.patch("/user/" + user.id)
				.set("Authorization", `Bearer ${accessToken}`)
				.send({ oldPassword: userPassword })
				.expect(400);
		});

		test("PATCH wrong old password 401", async () => {
			const oldPassword = "wrong old password";
			const newPassword = "87654321";
			await request(server)
				.patch("/user/" + user.id)
				.set("Authorization", `Bearer ${accessToken}`)
				.send({ oldPassword, newPassword })
				.expect(401);
		});

		test("PATCH bad new password 400", async () => {
			const oldPassword = userPassword;
			const newPassword = "short"; // Less than 8 characters
			await request(server)
				.patch("/user/" + user.id)
				.set("Authorization", `Bearer ${accessToken}`)
				.send({ oldPassword, newPassword })
				.expect(400);
		});

		test("DELETE 200", async () => {
			await request(server)
				.delete("/user/" + user.id)
				.set("Authorization", `Bearer ${accessToken}`)
				.expect(200);
			await request(server)
				.get("/user/" + user.id)
				.set("Authorization", `Bearer ${accessToken}`)
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
				.set("Authorization", `Bearer ${accessToken}`)
				.expect(401)
				.expect("Content-Type", /json/);
		});
	});
});

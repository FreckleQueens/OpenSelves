import "dotenv/config";

import * as argon2 from "argon2";
import { createId } from "@paralleldrive/cuid2";
import { members, users } from "openselves-common/db";

import { type DB, getDrizzle } from "./drizzle.js";

let db: DB;
async function main() {
	if (typeof process.env.DATABASE_URL !== "string") {
		throw new Error("DATABASE_URL env variable not defined");
	}

	db = getDrizzle(process.env.DATABASE_URL);
	const createdUsers = await db
		.insert(users)
		.values([
			{
				id: createId(),
				email: "jane@example.com",
				passwordHash: await argon2.hash("12345678"),
			},
			{
				id: createId(),
				email: "john@example.com",
				passwordHash: await argon2.hash("87654321"),
			},
		])
		.returning();
	const date = new Date();
	await db.insert(members).values([
		{
			userId: createdUsers[0].id,
			name: "Alice",
			pronouns: "she/her",
			description: "A member of our& system",
			createdAt: date,
			updatedAt: date,
		},
		{
			userId: createdUsers[0].id,
			name: "Bob",
			pronouns: "he/him",
			description: "Another member of our& system",
			createdAt: date,
			updatedAt: date,
		},
	]);
}
main()
	.then(async () => {
		await db.$client.end();
		console.log("Done");
	})
	.catch(async (e) => {
		console.error(e);
		await db.$client.end();
		process.exit(1);
	});

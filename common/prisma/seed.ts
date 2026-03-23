import * as argon2 from "argon2";

import { PrismaClient } from "../../server/src/generated/prisma/client";
import { PrismaService } from "../../server/src/prisma.service";

const connectionString = `${process.env.DATABASE_URL}`;
const prisma = new PrismaClient({
	adapter: PrismaService.getAdapter(connectionString),
});
async function main() {
	const user = await prisma.user.upsert({
		where: { email: "jane@example.com" },
		update: {},
		create: {
			email: "jane@example.com",
			passwordHash: await argon2.hash("12345678"),
		},
	});
	await prisma.user.upsert({
		where: { email: "john@example.com" },
		update: {},
		create: {
			email: "john@example.com",
			passwordHash: await argon2.hash("87654321"),
		},
	});
	await prisma.member.upsert({
		where: { id: "1" },
		update: {},
		create: {
			id: "1",
			userId: user.id,
			name: "Alice",
			pronouns: "she/her",
			description: "A member of our& system",
		},
	});
	await prisma.member.upsert({
		where: { id: "2" },
		update: {},
		create: {
			id: "2",
			userId: user.id,
			name: "Bob",
			pronouns: "he/him",
			description: "Another member of our& system",
		},
	});
}
main()
	.then(async () => {
		await prisma.$disconnect();
	})
	.catch(async (e) => {
		console.error(e);
		await prisma.$disconnect();
		process.exit(1);
	});

import * as argon2 from "argon2";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma.service";

const connectionString = `${process.env.DATABASE_URL}`;
const prisma = new PrismaClient({
	adapter: PrismaService.getAdapter(connectionString),
});
async function main() {
	await prisma.user.upsert({
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

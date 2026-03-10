import { Injectable } from "@nestjs/common";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "./generated/prisma/client";

@Injectable()
export class PrismaService extends PrismaClient {
	constructor() {
		if (!process.env["DATABASE_URL"]) {
			throw new Error("Missing DATABASE_URL environment variable");
		}

		const dbUrl = new URL(process.env["DATABASE_URL"]);
		const adapter = new PrismaMariaDb({
			user: dbUrl.username,
			password: dbUrl.password,
			host: dbUrl.hostname,
			port: dbUrl.port !== undefined ? parseInt(dbUrl.port) : undefined,
			database: dbUrl.pathname.substring(1),
		});
		super({
			adapter,
			omit: {
				user: { passwordHash: true },
			},
		});
	}
}

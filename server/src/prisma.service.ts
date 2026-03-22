import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { ConfigData } from "./config.data";
import { PrismaClient } from "./generated/prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
	public static dbUrlConfigKey: keyof ConfigData = "DATABASE_URL";

	constructor(configService: ConfigService<ConfigData>) {
		const dbUrl = new URL(
			configService.getOrThrow(PrismaService.dbUrlConfigKey, { infer: true }),
		);
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

	async onApplicationShutdown() {
		await this.$disconnect();
	}
}

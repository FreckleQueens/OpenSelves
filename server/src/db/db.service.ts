import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { type ConfigData } from "../config.data.js";
import { DB, getDrizzle } from "./drizzle.js";

export const dbProvider = {
	provide: DB,
	inject: [ConfigService],
	useFactory: (configService: ConfigService<ConfigData>) => {
		const useTestDb = configService.getOrThrow("USE_TEST_DB", {
			infer: true,
		});
		const connectionString = configService.getOrThrow<string>(
			useTestDb ? "TEST_DB_URL" : "DATABASE_URL",
			{
				infer: true,
			},
		);
		return getDrizzle(connectionString);
	},
};

@Injectable()
export class DbService implements OnApplicationShutdown {
	constructor(private readonly db: DB) {}

	async onApplicationShutdown() {
		await this.db.$client.end({
			timeout: 10,
		});
	}
}

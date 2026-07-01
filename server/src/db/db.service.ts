import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { type ConfigData } from "../config.data.js";
import { DB, getDrizzle } from "./drizzle.js";

export const dbProvider = {
	provide: DB,
	inject: [ConfigService],
	useFactory: (configService: ConfigService<ConfigData>) => {
		const connectionString = configService.getOrThrow<string>(DbService.dbUrlConfigKey, {
			infer: true,
		});
		return getDrizzle(connectionString);
	},
};

@Injectable()
export class DbService implements OnApplicationShutdown {
	public static dbUrlConfigKey: keyof ConfigData = "DATABASE_URL";

	constructor(private readonly db: DB) {}

	async onApplicationShutdown() {
		await this.db.$client.end({
			timeout: 10,
		});
	}
}

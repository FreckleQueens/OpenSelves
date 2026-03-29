import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { type ConfigData } from "../config.data.js";
import { type DB, getDrizzle } from "./drizzle.js";

export const DBClass = PostgresJsDatabase;
export const InjectDb = () => Inject(DBClass);

export const dbProvider = {
	provide: DBClass,
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

	constructor(@InjectDb() private readonly db: DB) {}

	async onApplicationShutdown() {
		await this.db.$client.end({
			timeout: 10,
		});
	}
}

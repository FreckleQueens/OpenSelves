import { PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import { models, relations } from "openselves-common/db";
import { type Sql } from "postgres";

export type DB = PostgresJsDatabase<typeof models, typeof relations> & {
	$client: Sql;
};

export function getDrizzle(databaseUrl: string): DB {
	return drizzle<typeof models, typeof relations, Sql>({
		connection: databaseUrl,
		schema: models,
		relations: relations,
	});
}

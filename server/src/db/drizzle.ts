import { PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import { relations } from "openselves-common/db";
import { type Sql } from "postgres";

export type DB = PostgresJsDatabase<typeof relations> & {
	$client: Sql;
};

export function getDrizzle(databaseUrl: string): DB {
	return drizzle<typeof relations, Sql>({
		connection: databaseUrl,
		relations: relations,
	});
}

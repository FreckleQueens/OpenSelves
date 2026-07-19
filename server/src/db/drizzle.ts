import { SQL, sql } from "drizzle-orm";
import { PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import { type Sql } from "postgres";

import { relations } from "./index.js";

export class DB extends PostgresJsDatabase<typeof relations> {
	$client!: Sql;
}

export function getDrizzle(databaseUrl: string): DB {
	return drizzle<typeof relations, Sql>({
		connection: databaseUrl,
		relations: relations,
	});
}

export function excludedColumn(col: { name: string }): SQL {
	return sql.raw(`excluded."${col.name}"`);
}

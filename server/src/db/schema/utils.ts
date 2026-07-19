import { createId } from "@paralleldrive/cuid2";
import { sql } from "drizzle-orm";
import { text, timestamp } from "drizzle-orm/pg-core";

const idColumn = () => text().notNull().$defaultFn(createId);
export const id = () => ({
	id: idColumn(),
});
export const idPrimaryKey = () => ({
	id: idColumn().unique().primaryKey(),
});
export const createdAt = () => ({
	createdAt: timestamp()
		.notNull()
		.default(sql`current_timestamp`),
});
export const timestamps = () => ({
	...createdAt(),
	updatedAt: timestamp()
		.notNull()
		.default(sql`current_timestamp`)
		.$onUpdateFn(() => sql`current_timestamp`),
});

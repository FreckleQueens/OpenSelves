import { createId } from "@paralleldrive/cuid2";
import { text, timestamp } from "drizzle-orm/pg-core";

const idColumn = () => text().notNull().$defaultFn(createId);
export const id = {
	id: idColumn(),
};
export const idPrimaryKey = {
	id: idColumn().unique().primaryKey(),
};
export const timestamps = {
	createdAt: timestamp().notNull().defaultNow(),
	updatedAt: timestamp()
		.notNull()
		.defaultNow()
		.$onUpdateFn(() => new Date()),
};

import type { PgAsyncTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { relations } from "./relations.js";
import type { models } from "./schema/index.js";

export type Transaction = PgAsyncTransaction<PostgresJsQueryResultHKT, typeof relations>;

export type Model<K extends keyof typeof models> = (typeof models)[K]["$inferSelect"];
export type ModelCreate<K extends keyof typeof models> = (typeof models)[K]["$inferInsert"];
export type ModelUpdate<K extends keyof typeof models> = Partial<ModelCreate<K>>;

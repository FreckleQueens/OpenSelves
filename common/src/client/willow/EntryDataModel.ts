import { createId } from "@paralleldrive/cuid2";

import { EntryWrapper, MAX_UINT64 } from "../../willow/index.js";
import { OPENSELVES_NAMESPACE_ID } from "../../willow/index.js";
import { j2000Now } from "../../willow/time.js";
import { deserializeValueFromPayload, serializeValueToPayload } from "./entry-payload.js";
import { SchemaBuilder } from "./schema-builder.js";
import {
	isValidSchemaFieldValue,
	isValidSchemaKey,
	isValidSchemaStatic,
	validateSchemaStatic,
} from "./schema-validator.js";
import type {
	KeyOfSchema,
	SchemaCreate,
	SchemaStatic,
	SchemaType,
	SchemaValueTypes,
} from "./types.js";

export const BaseSchema = {
	id: SchemaBuilder.string()
		.default(() => createId())
		.readonly(),
	createdAt: SchemaBuilder.date()
		.default(() => new Date())
		.readonly(),
} satisfies SchemaType;

export abstract class EntryDataModel<Schema extends SchemaType & typeof BaseSchema> {
	public static getModelKey(): string {
		throw new Error("Not implemented");
	}

	public readonly class: typeof EntryDataModel;
	private readonly _data: Record<string, SchemaValueTypes> = {};
	private readonly entries: Record<string, EntryWrapper> = {};
	private readonly pendingEntryMutations: [bigint, KeyOfSchema<Schema>, SchemaValueTypes][] = [];
	private readonly isConstructed: boolean;

	/**
	 * @param schema
	 * @param subspaceId
	 * @param from `SchemaCreate<Schema>` means create a new DataModel. `EntryWrapper[]` means load
	 * from existing DataModel.
	 */
	protected constructor(
		public readonly schema: Schema,
		public readonly subspaceId: string,
		from: SchemaCreate<Schema> | EntryWrapper[],
	) {
		this.class = this.constructor as typeof EntryDataModel;

		if (Array.isArray(from)) {
			if (from.length === 0) {
				throw new Error("Empty array of entries cannot construct DataModel");
			}

			const modelKey = this.class.getModelKey();
			const firstEntryPath = from[0].path;
			if (!firstEntryPath.startsWith(`/${modelKey}`)) {
				throw new Error("Gave an entry of wrong data model", { cause: from[0] });
			}

			this._data["id"] = firstEntryPath.substring(`/${modelKey}/`.length).split("/", 2)[0];

			const pathRoot = this.getPathRoot();
			for (const entry of from) {
				if (!entry.path.startsWith(pathRoot)) {
					throw new Error("Gave an entry of wrong record", {
						cause: {
							pathRoot,
							entry: entry.entryMaybeWithPayload,
						},
					});
				}

				const key = entry.path.substring(pathRoot.length + 1);
				if (this.entries[key]) {
					throw new Error("Got two entries with same key", {
						cause: {
							key,
							entry1: this.entries[key].entry,
							entry2: entry.entry,
						},
					});
				}

				if (entry.payload === undefined) {
					throw new Error("Got entry without payload", {
						cause: {
							entry,
						},
					});
				}

				if (entry.payload === "") {
					throw new Error("Got entry with empty payload", {
						cause: {
							entry,
						},
					});
				}

				if (isValidSchemaKey(this.schema, key)) {
					this.entries[key] = entry;
					this._data[key] = deserializeValueFromPayload(this.schema, key, entry.payload);
				}
			}
		} else {
			const now = j2000Now();
			for (const [key, field] of Object.entries(this.schema)) {
				let value: SchemaValueTypes = from[key];
				if (value === undefined) {
					if (field.hasDefault) {
						value = field.getDefault();
					} else {
						continue;
					}
				}
				this.set(key, value, now);
			}
		}

		// TODO: only set defaults of required fields that have a generated default value
		//  -> this means providing default values in `get data` and `get()`
		for (const [key, field] of Object.entries(this.schema)) {
			if (!isValidSchemaFieldValue(this.schema, key, this._data[key]) && field.hasDefault) {
				const value = field.getDefault();
				this.set(key, value);
			}
		}

		this.isConstructed = true;
	}

	public getPathRoot(): string {
		return `/${this.class.getModelKey()}/${this.get("id").toString()}`;
	}

	public get data(): SchemaStatic<Schema> {
		const output = { ...this._data };
		if (!isValidSchemaStatic(this.schema, output)) {
			throw new Error("Couldn't produce a complete dataset.", {
				cause: validateSchemaStatic(this.schema, output),
			});
		}
		return output;
	}

	public get<K extends KeyOfSchema<Schema>>(key: K): SchemaStatic<Schema>[K] {
		const existingValue = this._data[key];
		if (isValidSchemaFieldValue(this.schema, key, existingValue)) {
			return existingValue;
		}
		throw new Error("Missing or invalid value for key " + key, { cause: this._data });
	}

	public set<K extends KeyOfSchema<Schema>>(
		key: K,
		value: SchemaStatic<Schema>[K],
		timestamp?: bigint,
	): void;
	public set<K extends KeyOfSchema<Schema>>(key: K, value: unknown, timestamp?: bigint): void;
	public set<K extends KeyOfSchema<Schema>>(
		key: K,
		value: unknown,
		timestamp: bigint = j2000Now(),
	) {
		if (!isValidSchemaFieldValue(this.schema, key, value)) {
			throw new Error("Invalid value for key " + key, {
				cause: {
					value,
					schema: this.schema,
				},
			});
		}

		if (this.schema[key].isReadonly && this.isConstructed) {
			throw new Error(key + " is readonly");
		}

		// TODO: if previous mutations of same key exist, splice them from pendingEntryMutations
		// TODO: then, if value is equal to deserialize(this.entries[key].payload), drop mutation
		this.pendingEntryMutations.push([timestamp, key, value]);
		this._data[key as string] = value;
	}

	public assign(object: Partial<SchemaStatic<Schema>>) {
		Object.entries(object).map(([key, value]: [string, SchemaStatic<Schema>[string]]) => {
			return this.set(key, value);
		});
	}

	public isDirty(): boolean {
		return this.pendingEntryMutations.length > 0;
	}

	public async flushDirtyEntries(
		callback?: (entries: EntryWrapper[]) => Promise<void>,
	): Promise<EntryWrapper[]> {
		const mutations = [...this.pendingEntryMutations];
		const dirtyEntries = new Set<EntryWrapper>();
		for (const [timestamp, key, value] of mutations) {
			const payload = serializeValueToPayload(this.schema, key, value);
			let entry = this.entries[key];
			if (entry) {
				await entry.setPayload(payload, timestamp);
			} else {
				entry = this.entries[key] = await EntryWrapper.create(
					OPENSELVES_NAMESPACE_ID,
					this.subspaceId,
					this.getPathRoot() + "/" + key,
					timestamp,
					payload,
				);
			}
			dirtyEntries.add(entry);
		}

		await callback?.([...dirtyEntries]);

		mutations.forEach((mutation) =>
			this.pendingEntryMutations.splice(this.pendingEntryMutations.indexOf(mutation), 1),
		);
		return [...dirtyEntries];
	}

	public getEntries(): EntryWrapper[] {
		if (this.isDirty()) {
			throw new Error("DataModel is dirty. Must call flushDirtyEntries() first.");
		}
		return Object.values(this.entries);
	}

	public async makeDeleteEntry(timestamp: bigint = j2000Now()): Promise<EntryWrapper> {
		return await EntryWrapper.create(
			OPENSELVES_NAMESPACE_ID,
			this.subspaceId,
			this.getPathRoot(),
			timestamp,
			"",
		);
	}

	public async makePermanentDeleteEntry(): Promise<EntryWrapper> {
		return this.makeDeleteEntry(MAX_UINT64);
	}
}

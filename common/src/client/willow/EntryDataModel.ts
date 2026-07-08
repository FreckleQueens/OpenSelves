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
		.required()
		.default(() => createId())
		.readonly(),
	createdAt: SchemaBuilder.date()
		.required()
		.default(() => new Date())
		.readonly(),
} satisfies SchemaType;

export type EntryDataModelSchema = SchemaType & typeof BaseSchema;
export type AnyEntryDataModel = EntryDataModel<EntryDataModelSchema>;

export abstract class EntryDataModel<Schema extends EntryDataModelSchema> {
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
							entry: entry.entryWithPayload,
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
			for (const key of Object.keys(this.schema)) {
				if (key in from) {
					this.set(key, from[key], now);
				}
			}
		}

		for (const [key, field] of Object.entries(this.schema)) {
			if (!(key in this._data)) {
				if (field.hasDefault && field.isDefaultGenerated) {
					if (Array.isArray(from)) {
						this._data[key] = field.getDefault();
					} else {
						this.set(key, field.getDefault());
					}
				}
			}
		}

		this.isConstructed = true;
	}

	public getPathRoot(): string {
		return `/${this.class.getModelKey()}/${this.get("id").toString()}`;
	}

	public get data(): SchemaStatic<Schema> {
		const output = { ...this._data };

		for (const key of Object.keys(this.schema)) {
			if (!(key in output)) {
				output[key] = this.get(key);
			}
		}

		if (!isValidSchemaStatic(this.schema, output)) {
			throw new Error("Couldn't produce a complete dataset.", {
				cause: validateSchemaStatic(this.schema, output),
			});
		}
		return output;
	}

	public get<K extends KeyOfSchema<Schema>>(key: K): SchemaStatic<Schema>[K] {
		let value: SchemaValueTypes;

		if (key in this._data) {
			value = this._data[key];
		} else {
			const field = this.schema[key];
			if (field) {
				if (field.hasDefault) {
					value = field.getDefault();
				} else if (field.isOptional) {
					value = undefined;
				} else if (field.isNullable) {
					value = null;
				}
			}
		}

		if (isValidSchemaFieldValue(this.schema, key, value)) {
			return value;
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

		for (const mutation of this.pendingEntryMutations.filter(
			(mutation) => mutation[1] === key,
		)) {
			this.pendingEntryMutations.splice(this.pendingEntryMutations.indexOf(mutation), 1);
		}

		if (
			!this.entries[key] ||
			typeof this.entries[key].payload !== "string" ||
			value !== deserializeValueFromPayload(this.schema, key, this.entries[key].payload)
		) {
			this.pendingEntryMutations.push([timestamp, key, value]);
		}

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
		this.pendingEntryMutations.splice(0);

		let dirtyEntries: Set<EntryWrapper>;
		try {
			dirtyEntries = new Set<EntryWrapper>();
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
		} catch (e) {
			this.pendingEntryMutations.push(...mutations);
			throw e;
		}

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

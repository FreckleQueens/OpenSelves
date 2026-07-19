import { createId } from "@paralleldrive/cuid2";

import {
	type AnyFieldTypesValue,
	SchemaBuilder,
	type SchemaStaticValue,
} from "../../schema/index.js";
import {
	isValidSchemaFieldValue,
	isValidSchemaKey,
	isValidSchemaStatic,
	validateSchemaStatic,
} from "../../schema/index.js";
import type { KeyOfSchema, SchemaCreate, SchemaStatic, SchemaType } from "../../schema/types.js";
import { Path } from "../../willow/Path.js";
import { PathComponent, UInt64 } from "../../willow/index.js";
import { EntryWrapper, SubspaceId, Timestamp } from "../../willow/index.js";
import { OPENSELVES_NAMESPACE_ID } from "../../willow/index.js";
import {
	deserializeValueFromPayload,
	serializeValueToPayload,
	serializeValueToPayloadUnsafe,
} from "./entry-payload.js";

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
export type AnyEntryDataModel = EntryDataModel<typeof BaseSchema>;

export abstract class EntryDataModel<Schema extends EntryDataModelSchema> {
	public static getModelKey(): string {
		throw new Error("Not implemented");
	}

	public readonly class: typeof EntryDataModel;
	private readonly _data: Record<string, AnyFieldTypesValue> = {};
	private readonly entries: Record<string, EntryWrapper> = {};
	private readonly pendingEntryMutations: [Timestamp, KeyOfSchema<Schema>, AnyFieldTypesValue][] =
		[];
	private readonly isConstructed: boolean;

	/**
	 * @param schema
	 * @param subspaceId
	 * @param from `SchemaCreate<Schema>` means create a new DataModel. `EntryWrapper[]` means load
	 * from existing DataModel.
	 */
	protected constructor(
		public readonly schema: Schema,
		public readonly subspaceId: SubspaceId,
		from: SchemaCreate<Schema> | EntryWrapper[],
	) {
		this.class = this.constructor as typeof EntryDataModel;

		if (Array.isArray(from)) {
			if (from.length === 0) {
				throw new Error("Empty array of entries cannot construct DataModel");
			}

			const modelKey = this.class.getModelKey();
			const firstEntryPath = from[0].path;
			if (!Path.extends(firstEntryPath, Path.fromStrings(modelKey))) {
				throw new Error("Gave an entry of wrong data model", { cause: from[0] });
			}

			this._data["id"] = PathComponent.toString(firstEntryPath[1]);

			const pathRoot = this.getPathRoot();
			for (const entry of from) {
				if (!Path.extends(entry.path, pathRoot)) {
					throw new Error("Gave an entry of wrong record", {
						cause: {
							pathRoot,
							entry: entry.entryMaybeWithPayload,
						},
					});
				}

				const keyPathComponent = entry.path[pathRoot.length];
				if (!keyPathComponent) {
					throw new Error("Got entry with invalid path, not corresponding to any key", {
						cause: Path.toString(entry.path),
					});
				}

				const key = PathComponent.toString(keyPathComponent);
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

				if (isValidSchemaKey(this.schema, key)) {
					this.entries[key] = entry;
					this._data[key] = deserializeValueFromPayload(this.schema, key, entry.payload);
				}
			}
		} else {
			const now = Timestamp.now();
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

	public getPathRoot(): Path {
		return Path.fromStrings(this.class.getModelKey(), this.get("id") as "string");
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

	public get<K extends KeyOfSchema<Schema>>(key: K): SchemaStaticValue<Schema, K> {
		let value: AnyFieldTypesValue;

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
		value: SchemaStaticValue<Schema, K>,
		Timestamp?: bigint,
	): void;
	public set<K extends KeyOfSchema<Schema>>(key: K, value: unknown, timestamp?: Timestamp): void;
	public set<K extends KeyOfSchema<Schema>>(
		key: K,
		value: unknown,
		timestamp: Timestamp = Timestamp.now(),
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
		Object.entries(object).map(([key, value]) => {
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
						[...this.getPathRoot(), PathComponent.fromString(key)],
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

	public async makeDeleteEntry(timestamp: Timestamp = Timestamp.now()): Promise<EntryWrapper> {
		return await EntryWrapper.create(
			OPENSELVES_NAMESPACE_ID,
			this.subspaceId,
			this.getPathRoot(),
			timestamp,
			serializeValueToPayloadUnsafe(""),
		);
	}

	public async makePermanentDeleteEntry(): Promise<EntryWrapper> {
		return this.makeDeleteEntry(UInt64.MAX_VALUE);
	}
}

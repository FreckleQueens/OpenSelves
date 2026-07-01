import { createId } from "@paralleldrive/cuid2";

import { EntryWrapper, MAX_UINT64 } from "../../willow/index.js";
import { OPENSELVES_NAMESPACE_ID } from "../../willow/index.js";
import { j2000Now } from "../../willow/time.js";
import { deserializeValueFromPayload, serializeValueToPayload } from "./entry-payload.js";
import { SchemaBuilder } from "./schema-builder.js";
import { isFieldValueValid } from "./schema-validator.js";
import type { Schema, SchemaCreate, SchemaStatic, SupportedValueTypes } from "./types.js";

export const BaseSchema = {
	id: SchemaBuilder.string().default(() => createId()),
	createdAt: SchemaBuilder.date().default(() => new Date()),
} satisfies Schema;

export abstract class EntryDataModel<Model extends Schema & typeof BaseSchema> {
	private readonly _data: Record<string, SupportedValueTypes | null | undefined> = {};
	private entries?: Record<string, EntryWrapper>;
	private dirtyEntries: EntryWrapper[] = [];

	protected constructor(
		public readonly schema: Model,
		public readonly subspaceId: string,
		data?: SchemaCreate<Model>,
		entries?: EntryWrapper[],
	) {
		if (data) {
			if (entries) {
				throw new Error("Can only construct from either data or entries");
			}

			this._data = { ...data };
			for (const [key, field] of Object.entries(this.schema)) {
				const value = this._data[key];
				if (value === undefined) {
					if (field.hasDefault) {
						this._data[key] = field.getDefault();
					} else {
						delete this._data[key];
					}
				}
			}
		}

		if (entries) {
			if (data) {
				throw new Error("Can only construct from either data or entries");
			}
			if (entries.length === 0) {
				throw new Error("Empty array of entries cannot construct DataModel");
			}

			this.entries = {};

			const prefix = this.getPathPrefix();
			const firstEntryPath = entries[0].path;
			if (!firstEntryPath.startsWith(prefix)) {
				throw new Error("Gave an entry of wrong data model", { cause: entries[0] });
			}

			this._data["id"] = firstEntryPath.substring(prefix.length + 1).split("/", 2)[0];

			const pathRoot = this.getPathRoot();
			for (const entry of entries) {
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
				this.entries[key] = entry;
				if (entry.payload && this.isKeyOf(key)) {
					this._data[key] = deserializeValueFromPayload(this.schema, key, entry.payload);
				}
			}
		}
	}

	protected abstract getPathPrefix(): string;

	public getPathRoot(): string {
		return `${this.getPathPrefix()}/${this.get("id").toString()}`;
	}

	public get data(): Record<string, SupportedValueTypes | null | undefined> {
		return {
			...this._data,
		};
	}

	public get<K extends keyof SchemaStatic<Model> & string>(key: K): SchemaStatic<Model>[K] {
		const existingValue = this._data[key];
		if (existingValue && isFieldValueValid(this.schema, key, existingValue)) {
			return existingValue;
		} else {
			throw new Error("Missing value for key " + key, { cause: this._data });
		}
	}

	public async set<K extends keyof SchemaStatic<Model> & string>(
		key: K,
		value: SchemaStatic<Model>[K],
	) {
		const payload = serializeValueToPayload(this.schema, key, value);

		const entries = await this.computeEntries();
		const entry = entries[key];
		if (entry) {
			await entry.setPayload(payload);
			this.dirtyEntries.push(entry);
		} else {
			entries[key] = await this.createEntry(key, payload);
		}

		this._data[key as string] = value;
	}

	public async assign(object: Partial<SchemaStatic<Model>>) {
		await Promise.all(
			Object.entries(object).map(([key, value]: [string, SchemaStatic<Model>[string]]) => {
				return this.set(key, value);
			}),
		);
	}

	public get id(): string {
		return this.get("id");
	}

	public get createdAt(): Date {
		return this.get("createdAt");
	}

	public async flushDirtyEntries(
		callback?: (entries: EntryWrapper[]) => Promise<void>,
	): Promise<EntryWrapper[]> {
		await this.computeEntries();
		const entriesToFlush = [...new Set(this.dirtyEntries)];
		await callback?.(entriesToFlush);
		this.dirtyEntries = this.dirtyEntries.filter(
			(entry) => !entriesToFlush.find((flushedEntry) => flushedEntry === entry),
		);
		return entriesToFlush;
	}

	public async getDeleteEntry(timestamp: bigint = j2000Now()): Promise<EntryWrapper> {
		return await EntryWrapper.create(
			OPENSELVES_NAMESPACE_ID,
			this.subspaceId,
			this.getPathRoot(),
			timestamp,
			"",
		);
	}

	public async getPermanentDeleteEntry(): Promise<EntryWrapper> {
		return this.getDeleteEntry(MAX_UINT64);
	}

	public async computeEntries(): Promise<Record<string, EntryWrapper>> {
		if (!this.entries) {
			this.entries = {};
			const now = j2000Now();

			for (const [key, value] of Object.entries(this._data)) {
				const payload = serializeValueToPayload(this.schema, key, value);
				this.entries[key] = await this.createEntry(key, payload, now);
			}
		}
		return this.entries;
	}

	private async createEntry(
		key: keyof SchemaStatic<Model> & string,
		payload: string,
		timestamp: bigint = j2000Now(),
	): Promise<EntryWrapper> {
		const entry = await EntryWrapper.create(
			OPENSELVES_NAMESPACE_ID,
			this.subspaceId,
			this.getPathRoot() + "/" + key,
			timestamp,
			payload,
		);
		this.dirtyEntries.push(entry);
		return entry;
	}

	private isKeyOf(key: unknown): key is keyof SchemaStatic<Model> {
		return typeof key === "string" && Object.keys(this.schema).includes(key);
	}
}

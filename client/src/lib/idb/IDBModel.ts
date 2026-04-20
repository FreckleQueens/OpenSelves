import { IDB, type ModelBase } from "$lib/idb/idb";
import type { ColumnType } from "drizzle-orm/column-builder";

export type DBColumn = {
	dataType: ColumnType;
	notNull: boolean;
	enumValues: string[] | undefined;
};

export abstract class IDBModel<Model extends ModelBase, PrimaryKey extends keyof Model & string> {
	protected constructor(
		protected readonly idb: IDB,
		public readonly storeName: string,
		public readonly primaryKey: PrimaryKey,
	) {}

	public async getByPrimaryKey(value: string): Promise<Model> {
		const record = await this.idb.get(this.storeName, value);
		if (!record) {
			throw new Error(`Record not found: ${this.storeName}#${value}`);
		}
		return this.parseModel(record);
	}

	public async getByField<Field extends keyof Model & string>(
		field: Field,
		value: Model[Field],
	): Promise<Model[]> {
		const records = await this.idb.getByIndex(this.storeName, field, IDBKeyRange.only(value));
		return this.parseModels(records);
	}

	public async put(primaryKeyValue: string, data: Omit<Model, PrimaryKey>) {
		const modelData = this.parseModel({
			...data,
			[this.primaryKey]: primaryKeyValue,
		});
		await this.idb.transaction(this.storeName, async (tx) => {
			await tx.put(this.storeName, modelData);
		});
		return modelData;
	}

	public async delete(recordIds: string[]): Promise<void> {
		await this.idb.transaction(this.storeName, async (tx) => {
			for (const recordId of recordIds) {
				await tx.delete(this.storeName, recordId);
			}
		});
	}

	protected abstract generateUniquePrimaryKey(): string;
	protected abstract getDrizzleModel(): Record<keyof Model, DBColumn>;
	protected stripDrizzleFromModel<
		R extends Record<"_" | "$inferSelect" | "$inferInsert" | "enableRLS", unknown>,
	>(model: R) {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { _, $inferSelect, $inferInsert, enableRLS, ...rest } = model;
		return rest;
	}

	public parseModel(record: Partial<ModelBase>): Model {
		const out: Partial<Model> = {};
		const keys: string[] = [];
		const drizzleModel = this.getDrizzleModel();
		for (const key of Object.keys(drizzleModel)) {
			const column = drizzleModel[key];
			keys.push(key);

			if (!(key in record) || record[key] === null) {
				if (column.notNull) {
					throw new Error(
						`${this.storeName} record doesn't have required, non-null key ${key} (${record[key]})`,
						{
							cause: record,
						},
					);
				} else {
					if (record[key] !== undefined) {
						out[key] = record[key];
					}
					continue;
				}
			}

			if (record[key] instanceof Date && column.dataType === "object date") {
				out[key] = record[key];
				continue;
			}

			if (column.dataType === "string enum") {
				if (typeof record[key] === "string" && column.enumValues?.includes(record[key])) {
					out[key] = record[key];
					continue;
				} else {
					throw new Error(
						`${this.storeName} record[${key}]="${record[key]}" is not in [${column.enumValues?.join(", ")}]`,
						{
							cause: record,
						},
					);
				}
			}

			if (column.dataType === "object json") {
				if (typeof record[key] === "string") {
					let parsedJson: Record<string, unknown>;
					try {
						parsedJson = JSON.parse(record[key]);
					} catch (e) {
						throw new Error(
							`${this.storeName} record[${key}]="${record[key]}" is invalid json`,
							{
								cause: e,
							},
						);
					}
					out[key] = parsedJson;
					continue;
				} else {
					// Check value can be serialized
					try {
						JSON.stringify(record[key]);
						out[key] = record[key];
						continue;
					} catch (e) {
						throw new Error(
							`${this.storeName} record[${key}]="${record[key]}" is invalid json`,
							{
								cause: e,
							},
						);
					}
				}
			}

			if (column.dataType === "object date") {
				const date = new Date(record[key]);
				if (!Number.isFinite(date.getTime())) {
					throw new Error(
						`${this.storeName} record[${key}]="${record[key]}" is an invalid date`,
						{
							cause: record,
						},
					);
				} else {
					out[key] = date;
					continue;
				}
			}

			if (typeof record[key] !== column.dataType) {
				throw new Error(
					`${this.storeName} record[${key}]="${record[key]}" is not of column data type ${column.dataType}`,
					{
						cause: record,
					},
				);
			}

			out[key] = record[key];
		}

		const extraKeys = Object.keys(record).filter((key) => !keys.includes(key));
		if (extraKeys.length > 0) {
			throw new Error(
				`${this.storeName} record has invalid key(s) ${extraKeys.join(", ")} (not in model)`,
				{
					cause: record,
				},
			);
		}

		return out as Model;
	}

	public parseModels(records: ModelBase[]): Model[] {
		return records.map((record) => this.parseModel(record));
	}
}

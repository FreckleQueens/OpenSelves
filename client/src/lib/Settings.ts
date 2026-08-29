import { IDB } from "$lib/idb";

export abstract class Settings {
	private static instance: Settings;

	public static get(key: string): Promise<string | undefined> {
		return this.getInstance().get(key);
	}

	public static set(key: string, value: string | undefined): Promise<void> {
		return this.getInstance().set(key, value);
	}

	public static delete(key: string): Promise<void> {
		return this.getInstance().delete(key);
	}

	private static getInstance(): Settings {
		if (!this.instance) {
			this.instance = new IDBSettings();
		}
		return this.instance;
	}

	public abstract get(key: string): Promise<string | undefined>;

	public abstract set(key: string, value: string | undefined): Promise<void>;

	public async delete(key: string): Promise<void> {
		await this.set(key, undefined);
	}
}

export class IDBSettings extends Settings {
	private idb: IDB = IDB.getInstance();

	public async get(key: string): Promise<string | undefined> {
		return await this.idb.settings.get(key);
	}

	public async set(key: string, value: string | undefined): Promise<void> {
		if (value === undefined) {
			await this.idb.settings.delete(key);
		} else {
			await this.idb.settings.put(key, value);
		}
	}
}

import { appState } from "$lib/appState.svelte.js";
import { IDB } from "$lib/idb";

const CURRENT_USER_ID_KEY = "currentUserId";

export abstract class PersistentStorage {
	private static instance: PersistentStorage;

	public static getInstance(): PersistentStorage {
		if (!this.instance) {
			throw new Error("Storage not initialized.");
		}
		return this.instance;
	}

	public static async setInstance(instance: PersistentStorage): Promise<void> {
		if (this.instance) {
			throw new Error("Storage already initialized.");
		}
		this.instance = instance;
		await this.instance.init();
	}

	private _userId?: string;

	public async init(): Promise<void> {
		this.userId = await this.getRaw(CURRENT_USER_ID_KEY);
	}

	public getUserId(): string {
		const userId = this.userId;
		if (!userId) {
			throw new Error("SessionStorage userId not set.");
		}
		return userId;
	}

	/**
	 * Sets a path prefix to differentiate offline data and different user's data.
	 * Set to user id when logging in.
	 * @param userId
	 */
	public async setUserId(userId: string | undefined): Promise<void> {
		this.userId = userId;
		await this.setRaw(CURRENT_USER_ID_KEY, userId);
	}

	public hasUserId(): boolean {
		return this.userId !== undefined;
	}

	/**
	 * Use when logging out.
	 */
	public async setOffline(): Promise<void> {
		await this.setUserId(undefined);
	}

	public async get(path: string, absolute: boolean = false): Promise<string | undefined> {
		return this.getRaw(absolute ? path : `${this.getUserId()}.${path}`);
	}

	public abstract getRaw(path: string): Promise<string | undefined>;

	public async set(path: string, value: string, absolute: boolean = false): Promise<void> {
		await this.setRaw(absolute ? path : `${this.getUserId()}.${path}`, value);
	}

	public abstract setRaw(path: string, value: string | undefined): Promise<void>;

	private get userId(): string | undefined {
		return this._userId;
	}

	private set userId(userId: string | undefined) {
		this._userId = userId;
		appState.isAuthenticated = this.hasUserId();
	}
}

export class IDBStorage extends PersistentStorage {
	private idb: IDB = IDB.getInstance();

	public async getRaw(path: string): Promise<string | undefined> {
		const entries = await this.idb.storageEntry.getByField("key", path);
		const entry = entries[0];
		return entry ? entry.value : undefined;
	}

	public async setRaw(path: string, value: string | undefined): Promise<void> {
		if (value === undefined) {
			await this.idb.storageEntry.delete([path]);
		} else {
			await this.idb.storageEntry.put(path, {
				value: value,
			});
		}
	}
}

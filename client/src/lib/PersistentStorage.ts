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
		this.userId = await this.get(CURRENT_USER_ID_KEY, true);
	}

	public getUserId(): string {
		const userId = this.getUserIdOptional();
		if (!userId) {
			throw new Error("PersistentStorage userId not set.");
		}
		return userId;
	}

	public getUserIdOptional(): string | undefined {
		return this.userId;
	}

	/**
	 * Sets a key prefix to differentiate offline data and different user's data.
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

	public async get(key: string, absolute: boolean = false): Promise<string | undefined> {
		return this.getRaw(absolute ? key : `${this.getUserId()}.${key}`);
	}

	public async set(key: string, value: string, absolute: boolean = false): Promise<void> {
		await this.setRaw(absolute ? key : `${this.getUserId()}.${key}`, value);
	}

	public async setForUser(userId: string, key: string, value: string) {
		return this.set(`${userId}.${key}`, value, true);
	}

	public async delete(key: string, absolute: boolean = false): Promise<void> {
		await this.setRaw(absolute ? key : `${this.getUserId()}.${key}`, undefined);
	}

	protected abstract getRaw(key: string): Promise<string | undefined>;

	protected abstract setRaw(key: string, value: string | undefined): Promise<void>;

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

	protected async getRaw(key: string): Promise<string | undefined> {
		return await this.idb.storageEntry.get(key);
	}

	protected async setRaw(key: string, value: string | undefined): Promise<void> {
		if (value === undefined) {
			await this.idb.storageEntry.delete(key);
		} else {
			await this.idb.storageEntry.put(key, value);
		}
	}
}

const OFFLINE_KEY = "offline";
const CURRENT_KEY_KEY = "currentKey";

export abstract class Storage {
	private static storage: Storage;

	public static async getStorage(): Promise<Storage> {
		if (!this.storage) {
			this.storage = new LocalStorage();
			await this.storage.init();
		}
		return this.storage;
	}

	private key: string = OFFLINE_KEY;

	public async init(): Promise<void> {
		this.key = (await this.getRaw(CURRENT_KEY_KEY)) || OFFLINE_KEY;
		await this.initChild();
	}

	protected abstract initChild(): Promise<void>;

	public getKey(): string {
		return this.key;
	}

	/**
	 * Sets the root key to differentiate offline data and different user's data.
	 * Set to user id when logging in.
	 * @param key
	 */
	public async setKey(key: string): Promise<void> {
		this.key = key;
		await this.setRaw(CURRENT_KEY_KEY, key);
	}

	public isOffline(): boolean {
		return this.key === OFFLINE_KEY;
	}

	/**
	 * Use when logging out.
	 */
	public async setOffline(): Promise<void> {
		await this.setKey(OFFLINE_KEY);
	}

	public async get(path: string, absolute: boolean = false): Promise<string | undefined> {
		return this.getRaw(absolute ? path : `${this.key}.${path}`);
	}

	protected abstract getRaw(path: string): Promise<string | undefined>;

	public async set(path: string, value: string, absolute: boolean = false): Promise<void> {
		await this.setRaw(absolute ? path : `${this.key}.${path}`, value);
	}

	protected abstract setRaw(path: string, value: string): Promise<void>;
}

class LocalStorage extends Storage {
	private persistent: boolean = false;

	public async initChild(): Promise<void> {
		if (navigator.storage?.persist) {
			this.persistent = await navigator.storage.persisted();
			if (!this.persistent) {
				this.persistent = await navigator.storage?.persist();
			}
		}
	}

	public isPersistent(): boolean {
		return this.persistent;
	}

	protected async getRaw(path: string): Promise<string | undefined> {
		return localStorage.getItem(path) || undefined;
	}

	protected async setRaw(path: string, value: string): Promise<void> {
		localStorage.setItem(path, value);
	}
}

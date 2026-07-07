import { PersistentStorage } from "$lib/PersistentStorage";
import { call } from "$lib/api.svelte";
import { appState } from "$lib/appState.svelte.js";
import { IDBStore } from "$lib/idb/IDBStore";
import { IDB } from "$lib/idb/idb";
import {
	EntryWrapper,
	OPENSELVES_NAMESPACE_ID,
	j2000Now,
	toJsonFriendly,
} from "openselves-common/willow";

const PUSH_TIMESTAMP_STORAGE_KEY = "pushTimestamp";
const PULL_TIMESTAMP_STORAGE_KEY = "pullTimestamp";

export class SyncWorker {
	private static instance: SyncWorker;

	public static initialize(startOnline: boolean): void {
		if (this.instance) {
			throw new Error("SyncWorker already initialized");
		}

		this.instance = new SyncWorker(startOnline);
	}

	public static isInitialized(): boolean {
		return !!this.instance;
	}

	public static getInstance(): SyncWorker {
		if (!this.instance) {
			throw new Error("SyncWorker not initialized");
		}
		return this.instance;
	}

	private _hasPushBacklog: boolean = true;
	private syncTimeout: number | undefined = undefined;
	private syncing: boolean = false;
	private _online: boolean = false;
	private shuttingDownPromise: Promise<void> | undefined = undefined;

	protected constructor(online: boolean) {
		this.online = online;
		if (this.online) {
			this.resume();
		} else {
			this.pause();
		}
	}

	public hasPushBacklog() {
		return this._hasPushBacklog;
	}

	public setHasPushBacklog() {
		console.debug("push backlog notified, will try to push");
		this._hasPushBacklog = true;
		if (this.online) {
			this.scheduleSync();
		}
	}

	public resume() {
		console.debug("SyncWorker resumed");
		this.online = true;
		this.scheduleSync(100);
	}

	public pause() {
		console.debug("SyncWorker paused");
		this.online = false;
		this.unscheduleSync();
	}

	public async shutdown(): Promise<void> {
		if (this.shuttingDownPromise) {
			return this.shuttingDownPromise;
		}

		try {
			await (this.shuttingDownPromise = (async () => {
				this.pause();
				for (let attempts = 0; attempts < 3; attempts++) {
					if (!this._hasPushBacklog) {
						break;
					}
					try {
						await this.push();
					} catch (e) {
						console.error(e);
						if (attempts < 3) {
							await new Promise((resolve) => {
								setTimeout(resolve, 1500);
							});
						}
					}
				}
			})());
		} finally {
			this.shuttingDownPromise = undefined;
		}
	}

	public clearError() {
		appState.syncWorkerError = null;
	}

	private get online() {
		return this._online;
	}

	private set online(online: boolean) {
		this._online = online;
		appState.syncWorkerOnline = online;
	}

	private scheduleSync(delay: number = 1000) {
		if (this.syncing || !this.online) {
			return;
		}

		this.unscheduleSync();
		this.syncTimeout = window.setTimeout(() => {
			this.syncing = true;
			this.sync()
				.catch((err) => {
					appState.syncWorkerError = err;
					console.error(err);
				})
				.finally(() => {
					this.syncing = false;
					this.scheduleSync(5000);
				});
		}, delay);
	}

	private unscheduleSync() {
		if (this.syncTimeout !== undefined) {
			clearTimeout(this.syncTimeout);
			this.syncTimeout = undefined;
		}
	}

	private async sync() {
		if (await this.push()) {
			await this.pull();
		} else {
			console.debug("Push failed, skipping pull");
		}
	}

	private async push(): Promise<boolean> {
		const storage = PersistentStorage.getInstance();
		const idb = IDB.getInstance();

		const userId = storage.getUserIdOptional();
		if (!userId) {
			return false;
		}

		let lastPushTimestamp: bigint = 0n;
		const rawLastPushTimestamp = await storage.get(PUSH_TIMESTAMP_STORAGE_KEY);
		if (rawLastPushTimestamp) {
			try {
				lastPushTimestamp = BigInt(rawLastPushTimestamp);
			} catch {
				// ignore
			}
		}

		const thisPushAttemptTimestamp = j2000Now();
		const pendingEntries = await idb.entries.getAfterSavedAt(
			OPENSELVES_NAMESPACE_ID,
			userId,
			lastPushTimestamp,
		);
		const formattedEntries = pendingEntries.map(toJsonFriendly);

		if (pendingEntries.length > 0) {
			console.debug("Entries to push:", pendingEntries);
			const result = await call("/sync/push", {
				method: "PUT",
				data: {
					entries: formattedEntries,
				},
			});

			if (!result) {
				console.debug("push failed with response", result);
				return false;
			}

			await storage.setForUser(
				userId,
				PUSH_TIMESTAMP_STORAGE_KEY,
				thisPushAttemptTimestamp.toString(),
			);
		}

		if (
			(
				await idb.entries.getAfterSavedAt(
					OPENSELVES_NAMESPACE_ID,
					userId,
					thisPushAttemptTimestamp,
				)
			).length === 0
		) {
			this._hasPushBacklog = false;
		}

		return true;
	}

	private async pull(): Promise<void> {
		const storage = PersistentStorage.getInstance();

		const userId = storage.getUserIdOptional();
		if (!userId) {
			return;
		}

		const lastPullTimestamp = (await storage.get(PULL_TIMESTAMP_STORAGE_KEY)) || "";
		const result = await call("/sync/pull", {
			method: "POST",
			data: {
				timestamp: lastPullTimestamp,
			},
		});

		if (!result) {
			console.debug("pull failed with response", result);
			return;
		}

		const rawEntries = result.responseBody["entries"];
		if (!Array.isArray(rawEntries)) {
			console.warn("Server reply with a non-array", { cause: rawEntries });
			return;
		}

		if (rawEntries.length > 0) {
			console.debug("Entries to ingest:", rawEntries);
			const parsedEntry = await Promise.all(
				rawEntries.map((entry) => EntryWrapper.load(entry)),
			);
			const entriesWithPayload = parsedEntry.map((entry) => entry.entryWithPayload);

			await IDBStore.getInstance(OPENSELVES_NAMESPACE_ID)
				.userArea(userId)
				.ingest(entriesWithPayload, {
					dontMarkSavedEntriesForSync: true,
				});

			const timestamp = result.responseBody["timestamp"];
			if (typeof timestamp === "string") {
				await storage.setForUser(userId, PULL_TIMESTAMP_STORAGE_KEY, timestamp);
			}
		}
	}
}

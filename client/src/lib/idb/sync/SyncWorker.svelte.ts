import { call } from "$lib/api.svelte.js";
import { IDB } from "$lib/idb";
import { IDBStore } from "$lib/idb/IDBStore";
import { Profile } from "$lib/idb/profiles";
import { readStream } from "openselves-common";
import {
	Drop,
	type EntryWithPayload,
	OPENSELVES_NAMESPACE_ID,
	SubspaceId,
	Timestamp,
} from "openselves-common/willow";

let _running: boolean = $state(false);
let _error: never | null = $state(null);

// TODO: never pause the sync process? (always check if syncing is possible for current profile)
export class SyncWorker {
	private static instance: SyncWorker;

	public static get running() {
		return _running;
	}

	private static set running(running: boolean) {
		_running = running;
	}

	public static get error() {
		return _error;
	}

	private static set error(error: never | null) {
		_error = error;
	}

	public static initialize(startOnline: boolean): void {
		if (this.instance) {
			throw new Error("SyncWorker already initialized");
		}

		this.instance = new SyncWorker(startOnline);
	}

	public static clearError() {
		this.error = null;
	}

	public static isInitialized(): boolean {
		return !!this.instance;
	}

	// TODO: make this private
	public static getInstance(): SyncWorker {
		if (!this.instance) {
			throw new Error("SyncWorker not initialized");
		}
		return this.instance;
	}

	private _hasEntriesToPush: boolean = true;
	private syncTimeout: number | undefined = undefined;
	private syncing: boolean = false;

	private shuttingDownPromise: Promise<void> | undefined = undefined;

	protected constructor(running: boolean) {
		this.running = running;
		if (this.running) {
			this.resume();
		} else {
			this.pause();
		}
	}

	public hasEntriesToPush() {
		return this._hasEntriesToPush;
	}

	public setHasEntriesToPush() {
		console.debug("entries to push notified, will try to push");
		this._hasEntriesToPush = true;
		if (this.running) {
			this.scheduleSync();
		}
	}

	public resume() {
		console.debug("SyncWorker resumed");
		this.running = true;
		this.scheduleSync(100);
	}

	public pause() {
		console.debug("SyncWorker paused");
		this.running = false;
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
					if (!this._hasEntriesToPush) {
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

	private get running() {
		return SyncWorker.running;
	}

	private set running(online: boolean) {
		SyncWorker.running = online;
	}

	private scheduleSync(delay: number = 1000) {
		if (this.syncing || !this.running) {
			return;
		}

		this.unscheduleSync();
		this.syncTimeout = window.setTimeout(() => {
			this.syncing = true;
			this.sync()
				.catch((err) => {
					SyncWorker.error = err;
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
		if (!Profile.hasCurrentProfile()) {
			return false;
		}

		const profile = Profile.getCurrentProfile();

		if (!profile.isSyncEnabled()) {
			return false;
		}

		const idb = IDB.getInstance();

		let lastPushTimestamp: bigint = 0n;
		const rawLastPushTimestamp = profile.pushTimestamp;
		if (rawLastPushTimestamp) {
			try {
				lastPushTimestamp = BigInt(rawLastPushTimestamp);
			} catch {
				// ignore
			}
		}

		const thisPushAttemptTimestamp = Timestamp.now();

		async function getPendingEntries() {
			return (
				await Promise.all(
					profile.ownSubspaces.map((subspace) =>
						idb.entries.getAfterSavedAt(
							OPENSELVES_NAMESPACE_ID,
							subspace.subspaceId,
							lastPushTimestamp,
						),
					),
				)
			).flat();
		}

		const pendingEntries = await getPendingEntries();

		if (pendingEntries.length > 0) {
			console.debug("Entries to push:", pendingEntries);

			const encoder = Drop.encoder();
			let result: { response: Response; responseBody?: Record<string, unknown> } | undefined;
			try {
				[, result] = await Promise.all([
					(async () => {
						const writer = encoder.writable.getWriter();
						for (const entry of pendingEntries) {
							await writer.write(entry);
						}
						await writer.close();
					})(),
					call("/sync/push", {
						method: "PUT",
						data: encoder.readable,
					}),
				]);
			} catch (e) {
				console.debug("push failed with error", e, result);
				return false;
			}

			if (!result || !result.response.ok) {
				console.debug("push failed with response", result);
				return false;
			}

			await profile.setPushTimestamp(thisPushAttemptTimestamp.toString());
		}

		if ((await getPendingEntries()).length === 0) {
			this._hasEntriesToPush = false;
		}

		return true;
	}

	private async pull(): Promise<void> {
		if (!Profile.hasCurrentProfile()) {
			return;
		}

		const profile = Profile.getCurrentProfile();

		if (profile.knownSubspaces.length === 0) {
			return;
		}

		const lastPullTimestamp = profile.pullTimestamp || "";
		const result = await call("/sync/pull", {
			method: "POST",
			data: {
				timestamp: lastPullTimestamp,
				subspaceIds: profile.knownSubspaces.map((subspace) =>
					subspace.subspaceId.toBase64(),
				),
			},
		});

		if (!result || result.responseBody || !result.response.body) {
			console.debug("pull failed with response", result);
			return;
		}

		const decoder = Drop.decoder();
		const readable = result.response.body.pipeThrough(decoder);

		let entries: EntryWithPayload[];
		try {
			entries = await readStream(readable);
		} catch (e) {
			console.debug("pull failed while decoding drop", e);
			return;
		}

		if (entries.length > 0) {
			console.debug("Entries to ingest:", entries);
			for (const entry of entries) {
				if (
					!profile.knownSubspaces.some((subspace) =>
						SubspaceId.equals(subspace.subspaceId, entry.subspaceId),
					)
				) {
					throw new Error("Got entry with wrong subspaceId", { cause: entry });
				}
			}

			await IDBStore.getInstance(OPENSELVES_NAMESPACE_ID).ingest(entries, {
				dontMarkSavedEntriesForSync: true,
			});

			const timestamp = result.response.headers.get("X-OpenSelves-Pull-Timestamp");
			if (typeof timestamp === "string") {
				await profile.setPullTimestamp(timestamp);
			}
		}
	}
}

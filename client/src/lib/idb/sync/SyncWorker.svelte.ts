import { Api, navigatorOnlineState } from "$lib/api.svelte.js";
import { IDB } from "$lib/idb";
import { IDBStore } from "$lib/idb/IDBStore";
import { Profile, profilesState } from "$lib/idb/profiles";
import { OPENSELVES_NAMESPACE_ID, readStream } from "openselves-common";
import {
	type AuthorisedEntryWithPayload,
	Capability,
	Drop,
	SubspaceId,
	Timestamp,
} from "openselves-common/willow";

let _error: never | null = $state(null);
const _canSync: boolean = $derived(
	navigatorOnlineState.online &&
		profilesState.hasCurrentProfile &&
		profilesState.isSyncEnabled &&
		profilesState.isApiReachable,
);

export class SyncWorker {
	private static instance: SyncWorker;

	public static get error() {
		return _error;
	}

	private static set error(error: never | null) {
		_error = error;
	}

	public static get canSync(): boolean {
		return _canSync;
	}

	public static initialize(): void {
		if (this.instance) {
			throw new Error("SyncWorker already initialized");
		}

		this.instance = new SyncWorker();
	}

	public static clearError() {
		this.error = null;
	}

	public static isInitialized(): boolean {
		return !!this.instance;
	}

	private static getInstance(): SyncWorker {
		if (!this.instance) {
			throw new Error("SyncWorker not initialized");
		}
		return this.instance;
	}

	public static bootstrap() {
		this.getInstance().bootstrap();
	}

	public static async shutdown() {
		return this.getInstance().shutdown();
	}

	public static get hasEntriesToPush(): boolean {
		return this.getInstance().hasEntriesToPush();
	}

	public static setHasEntriesToPush() {
		this.getInstance().setHasEntriesToPush();
	}

	private _hasEntriesToPush: boolean = true;
	private syncTimeout: number | undefined = undefined;
	private syncing: boolean = false;

	private shuttingDownPromise: Promise<void> | undefined = undefined;

	protected constructor() {
		this.bootstrap();
	}

	public hasEntriesToPush() {
		return this._hasEntriesToPush;
	}

	public setHasEntriesToPush() {
		console.debug("entries to push notified, will try to push");
		this._hasEntriesToPush = true;
		this.scheduleSync();
	}

	public bootstrap() {
		console.debug("Starting SyncWorker...");
		this.scheduleSync(100);
	}

	public async shutdown(): Promise<void> {
		console.debug("Shutting down SyncWorker...");
		if (this.shuttingDownPromise) {
			return this.shuttingDownPromise;
		}

		try {
			await (this.shuttingDownPromise = (async () => {
				this.unscheduleSync();
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

	private scheduleSync(delay: number = 1000) {
		if (this.syncing) {
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
		if (!SyncWorker.canSync) {
			return;
		}

		if (await this.push()) {
			await this.pull();
		} else {
			console.debug("Push failed, skipping pull");
		}
	}

	private async push(): Promise<boolean> {
		if (!SyncWorker.canSync) {
			return false;
		}

		if (!this.hasEntriesToPush) {
			return true;
		}

		const profile = Profile.getCurrentProfile();
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

		if (!SyncWorker.canSync) {
			return false;
		}

		if (pendingEntries.length > 0) {
			console.debug("Pushing entries...", pendingEntries);

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
					Api.call("/sync/push", {
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
		if (!SyncWorker.canSync) {
			return;
		}

		const profile = Profile.getCurrentProfile();
		const capabilities = profile.getReadCapabilities();

		if (capabilities.length === 0) {
			return;
		}

		const lastPullTimestamp = profile.pullTimestamp || "";
		const result = await Api.call("/sync/pull", {
			method: "POST",
			data: {
				timestamp: lastPullTimestamp,
				capabilities: await Promise.all(
					capabilities.map(async (cap) => (await Capability.encode(cap)).toBase64()),
				),
			},
		});

		if (!result || result.responseBody || !result.response.body) {
			console.debug("pull failed with response", result);
			return;
		}

		const decoder = await Drop.decoder();
		const readable = result.response.body.pipeThrough(decoder);

		let entries: AuthorisedEntryWithPayload[];
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

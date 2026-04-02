import { call } from "$lib";
import { IDB } from "$lib/idb/idb";
import { syncWorkerState } from "$lib/idb/syncWorkerState.svelte";
import { Storage } from "$lib/storage";

export class SyncWorker {
	private static instance: SyncWorker;

	public static getInstance(defaultOnline: boolean = navigator.onLine): SyncWorker {
		if (!this.instance) {
			this.instance = new SyncWorker(defaultOnline);
		}
		return this.instance;
	}

	private dirty: boolean = true;
	private pushTimeout: number | undefined = undefined;
	private pushing: boolean = false;

	protected constructor(private online: boolean) {
		if (this.online) {
			this.goOnline();
		} else {
			this.goOffline();
		}
	}

	public setDirty() {
		console.trace("dirty");
		this.dirty = true;
		if (this.online) {
			this.scheduleSync();
		}
	}

	public goOnline() {
		console.log("online");
		this.online = true;
		if (this.dirty) {
			this.scheduleSync(500);
		}
	}

	public goOffline() {
		console.log("offline");
		this.online = false;
		this.unscheduleSync();
	}

	private scheduleSync(delay: number = 5000) {
		this.unscheduleSync();

		console.log("Schedule push in", delay);
		this.pushTimeout = window.setTimeout(() => {
			this.pushing = true;
			this.dirty = false;
			this.push()
				.catch((err) => {
					syncWorkerState.error = err;
					console.error(err);
					this.dirty = true;
				})
				.finally(() => {
					this.pushing = false;
					if (this.dirty) {
						this.scheduleSync();
					} else {
						return this.pull();
					}
				});
		}, delay);
	}

	private unscheduleSync() {
		console.log("Cancel push");
		if (this.pushTimeout !== undefined) {
			clearTimeout(this.pushTimeout);
			this.pushTimeout = undefined;
		}
	}

	private async push() {
		console.log("Do push");
		const storage = await Storage.getStorage();
		const userId = storage.getKey();

		const idb = await IDB.getClient();
		const pendingLogs = await idb.log.getAll(userId);
		const formattedLogs = pendingLogs
			.map((log) => {
				const newLog = { ...log };
				delete newLog.pushedAt;
				if (typeof newLog.data === "string") {
					newLog.data = JSON.parse(newLog.data);
				}
				return newLog;
			})
			.sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime());

		if (formattedLogs.length > 0) {
			const response = await call("/sync/push", {
				method: "PUT",
				data: {
					logs: formattedLogs,
				},
			});
			if (typeof response === "object") {
				await idb.log.delete(
					userId,
					formattedLogs.map((log) => log.id),
				);
			}
		}
		console.log(formattedLogs);
	}

	private async pull() {
		console.log("pull");
		const storage = await Storage.getStorage();
		const userId = storage.getKey();
		const currentTimestamp = await storage.get("timestamp");
		const idb = await IDB.getClient();
		const response = await call("/sync/pull", {
			method: "POST",
			data: {
				timestamp:
					currentTimestamp && Number.isFinite(currentTimestamp)
						? Number(currentTimestamp)
						: "init",
			},
		});

		const logs = response["logs"];
		if (Array.isArray(logs)) {
			for (const log of logs) {
				const { memberId, operationType, data } = log as {
					memberId: string;
					operationType: string;
					data: Record<string, unknown>;
				};
				console.log(log);
				switch (operationType) {
					case "create":
					case "update":
						await idb.member.save(userId, { ...data, id: memberId }, false);
						break;
					case "delete":
						await idb.member.delete(userId, [memberId], false);
						break;
					default:
						throw new Error("unrecognized operation type: " + operationType);
				}
			}
		}

		const timestamp = response["timestamp"];
		if (typeof timestamp === "number") {
			await storage.set("timestamp", timestamp.toString());
		}

		this.scheduleSync(30000);
	}
}

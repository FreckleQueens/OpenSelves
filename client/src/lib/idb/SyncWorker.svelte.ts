import { call } from "$lib";
import { IDB } from "$lib/idb/idb";
import { Storage } from "$lib/storage";

export class SyncWorker {
	private static instance: SyncWorker;

	public static initialize(startOnline: boolean): void {
		if (this.instance) {
			throw new Error("SyncWorker already initialized");
		}

		this.instance = new SyncWorker(startOnline);
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
	public error: unknown = $state(null);

	protected constructor(private online: boolean) {
		if (this.online) {
			this.resume();
		} else {
			this.pause();
		}
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
		this.unscheduleSync();
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
	}

	public clearError() {
		this.error = null;
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
					this.error = err;
					console.error(err);
				})
				.finally(() => {
					this.syncing = false;
					this.scheduleSync(5000);
				});
		}, delay);

		console.debug("Sync scheduled in", delay);
	}

	private unscheduleSync() {
		if (this.syncTimeout !== undefined) {
			clearTimeout(this.syncTimeout);
			this.syncTimeout = undefined;
		}
	}

	private async sync() {
		console.debug("Sync start");
		await this.push();
		await this.pull();
		console.debug("Sync end");
	}

	private async push() {
		console.debug("Push start");
		const storage = await Storage.getStorage();
		const userId = storage.getKey();

		const idb = await IDB.getClient();
		const pendingLogs = await idb.log.getAll(userId);
		const formattedLogs = pendingLogs
			.map((log) => {
				const newLog = { ...log };
				if (typeof newLog.data === "string") {
					newLog.data = JSON.parse(newLog.data);
				}
				return newLog;
			})
			.sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime());

		console.debug("Logs to push:", formattedLogs);

		if (formattedLogs.length > 0) {
			const response = await call("/sync/push", {
				method: "PUT",
				data: {
					logs: formattedLogs,
				},
			});
			if (typeof response === "object") {
				await idb.log.delete(formattedLogs.map((log) => log.id));
			}
		}

		if ((await idb.log.getAll(userId)).length === 0) {
			this._hasPushBacklog = false;
		}

		console.debug("Push end");
	}

	private async pull() {
		console.debug("Pull start");
		const storage = await Storage.getStorage();
		const userId = storage.getKey();
		const currentTimestamp = Number(await storage.get("timestamp"));
		const idb = await IDB.getClient();
		const reqTimestamp =
			currentTimestamp && Number.isFinite(currentTimestamp) ? currentTimestamp : "init";
		console.debug("timestamp:", currentTimestamp, reqTimestamp);
		const response = await call("/sync/pull", {
			method: "POST",
			data: {
				timestamp: reqTimestamp,
			},
		});

		const logs = response["logs"];
		console.debug("Logs to apply:", logs);
		if (Array.isArray(logs)) {
			for (const log of logs) {
				const { memberId, operationType, data } = log as {
					memberId: string;
					operationType: string;
					data: Record<string, unknown>;
				};
				switch (operationType) {
					case "create":
					case "update":
						await idb.member.saveSynced(userId, { ...data, id: memberId }, false);
						break;
					case "delete":
						await idb.member.deleteSynced(userId, [memberId], false);
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

		console.debug("Pull end");
	}
}

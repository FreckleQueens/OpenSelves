import { PersistentStorage } from "$lib/PersistentStorage";
import { call } from "$lib/api.svelte";
import { appState } from "$lib/appState.svelte.js";
import { IDB } from "$lib/idb/idb";

import type { IDBFront } from "./IDBFront";
import type { IDBMember } from "./IDBMember";

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
	private _online: boolean = false;

	protected constructor(online: boolean) {
		this.online = online;
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
		if (await this.push()) {
			await this.pull();
		} else {
			console.debug("skipping pull");
		}
		console.debug("Sync end");
	}

	private async push(): Promise<boolean> {
		console.debug("Push start");
		const storage = PersistentStorage.getInstance();
		const idb = IDB.getInstance();

		const userId = storage.getUserId();
		const pendingLogs = await idb.log.getByField("userId", userId);
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

			if (!response || typeof response !== "object") {
				console.debug("push failed with response", response);
				return false;
			}

			await idb.log.delete(formattedLogs.map((log) => log.id));
		}

		if ((await idb.log.getByField("userId", userId)).length === 0) {
			this._hasPushBacklog = false;
		}

		console.debug("Push end");
		return true;
	}

	private async pull(): Promise<void> {
		console.debug("Pull start");
		const storage = PersistentStorage.getInstance();
		const idb = IDB.getInstance();

		const userId = storage.getUserId();
		const currentTimestamp = Number(await storage.get("timestamp"));
		const reqTimestamp =
			currentTimestamp && Number.isFinite(currentTimestamp) ? currentTimestamp : "init";
		console.debug("timestamp:", currentTimestamp, reqTimestamp);
		const response = await call("/sync/pull", {
			method: "POST",
			data: {
				timestamp: reqTimestamp,
			},
		});

		if (!response || typeof response !== "object") {
			console.debug("pull failed with response", response);
			return;
		}

		const logs = response["logs"];
		console.debug("Logs to apply:", logs);
		if (Array.isArray(logs)) {
			for (const log of logs) {
				const { memberId, frontId, operationType, data } = log as {
					frontId?: string;
					memberId?: string;
					operationType: string;
					data: Record<string, unknown>;
				};
				let model: IDBMember | IDBFront | undefined;
				let recordId: string | undefined;
				if (typeof memberId === "string") {
					recordId = memberId;
					model = idb.member;
				} else if (typeof frontId === "string") {
					recordId = frontId;
					model = idb.front;
				}

				if (!model || !recordId) {
					throw new Error("Received log for unknown model");
				}

				switch (operationType) {
					case "create":
						await model.saveSynced(userId, { ...data, id: recordId }, false, false);
						break;
					case "update":
						await model.saveSynced(userId, { ...data, id: recordId }, true, false);
						break;
					case "delete":
						await model.deleteSynced(userId, [recordId], false);
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

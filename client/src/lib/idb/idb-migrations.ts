import { ENTRY_STORE_NAME } from "$lib/idb/IDBEntry";
import { KNOWN_SUBSPACE_STORE_NAME } from "$lib/idb/IDBKnownSubspace";
import { PAYLOAD_STORE_NAME } from "$lib/idb/IDBPayload";
import { PROFILE_STORE_NAME } from "$lib/idb/IDBProfile";
import { SETTING_STORE_NAME } from "$lib/idb/IDBSetting";
import { IDB } from "$lib/idb/idb";

export const IDB_MIGRATIONS: {
	type: "schema" | "data";
	run: (db: IDBDatabase, tx: IDBTransaction | null, idb: IDB) => Promise<void> | void;
}[] = [
	// create settings store
	{
		type: "schema",
		run: (db) => {
			const settingsStore = db.createObjectStore(SETTING_STORE_NAME, {
				keyPath: "key",
			});
			settingsStore.createIndex("key", "key", { unique: true });
		},
	},

	// create entries store
	{
		type: "schema",
		run: (db) => {
			const entriesStore = db.createObjectStore(ENTRY_STORE_NAME, {
				keyPath: ["namespaceId", "subspaceId", "path"],
			});
			entriesStore.createIndex("primaryKey", ["namespaceId", "subspaceId", "path"], {
				unique: true,
			});
			entriesStore.createIndex("namespaceId", "namespaceId");
			entriesStore.createIndex("payloadDigest", "payloadDigest");
			entriesStore.createIndex("namespaceIdSubspaceId", ["namespaceId", "subspaceId"]);
			entriesStore.createIndex("namespaceIdSubspaceIdSavedAt", [
				"namespaceId",
				"subspaceId",
				"savedAt",
			]);
		},
	},

	// create payloads store
	{
		type: "schema",
		run: (db) => {
			const payloadStore = db.createObjectStore(PAYLOAD_STORE_NAME, {
				keyPath: "digest",
			});
			payloadStore.createIndex("digest", "digest", { unique: true });
		},
	},

	// create profiles store
	{
		type: "schema",
		run: (db) => {
			const profilesStore = db.createObjectStore(PROFILE_STORE_NAME, {
				keyPath: "id",
			});
			profilesStore.createIndex("id", "id", {
				unique: true,
			});
		},
	},

	// create knownSubspaces store
	{
		type: "schema",
		run: (db) => {
			const knownSubspacesStore = db.createObjectStore(KNOWN_SUBSPACE_STORE_NAME, {
				keyPath: ["profileId", "subspaceId"],
			});
			knownSubspacesStore.createIndex("primaryKey", ["profileId", "subspaceId"], {
				unique: true,
			});
			knownSubspacesStore.createIndex("profileId", "profileId");
		},
	},
];

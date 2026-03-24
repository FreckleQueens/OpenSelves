import { Storage } from "$lib/storage";

import { PrismaIDBClient } from "../generated/prisma/client";

const IDB_MIGRATION_KEY = "idb-migration";
export class IDB {
	private static client: PrismaIDBClient;

	public static async getClient(): Promise<PrismaIDBClient> {
		if (!this.client) {
			this.client = await PrismaIDBClient.createClient();
			await this.fixupData(this.client);
		}
		return this.client;
	}

	private static async fixupData(client: PrismaIDBClient): Promise<void> {
		const storage = await Storage.getStorage();
		const nextMigration = Number(await storage.get(IDB_MIGRATION_KEY, true)) || 0;
		for (let i = nextMigration; i < migrations.length; i++) {
			console.log(`Running migration ${i}...`);
			const migration = migrations[i];
			await migration.apply(client);
			await storage.set(IDB_MIGRATION_KEY, (i + 1).toString(), true);
		}
	}
}

/**
 * Needed until https://github.com/prisma-idb/idb-client-generator/pull/175 is merged.
 * The apply method MUST ONLY have an effect on non-updated data. Applying twice MUST have no effect
 * the second time. All updates must conform to the prisma schema and prisma migrations. Changes
 * to the data MUST NOT be sent to server, and thus use `addToOutbox: false` option on idb client
 * requests.
 */
interface Migration {
	apply(client: PrismaIDBClient): Promise<void>;
}

const migrations: Migration[] = [];

// Add isArchived and archivedReason to Member
migrations[0] = new (class implements Migration {
	async apply(client: PrismaIDBClient): Promise<void> {
		const members = await client.member.findMany();
		for (const member of members) {
			if (!("isArchived" in member)) {
				await client.member.update(
					{
						where: { id: member["id"] },
						data: {
							isArchived: false,
						},
					},
					{
						addToOutbox: false,
					},
				);
			}
			if (!("archivedReason" in member)) {
				await client.member.update(
					{
						where: { id: member["id"] },
						data: {
							archivedReason: null,
						},
					},
					{
						addToOutbox: false,
					},
				);
			}
		}
	}
})();

import { PrismaIDBClient } from "../generated/prisma/client";

export class IDB {
	private static client: PrismaIDBClient;

	public static async getClient(): Promise<PrismaIDBClient> {
		if (!this.client) {
			this.client = await PrismaIDBClient.createClient();
		}
		return this.client;
	}
}

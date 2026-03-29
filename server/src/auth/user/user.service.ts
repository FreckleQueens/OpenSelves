import * as argon2 from "argon2";
import { Injectable } from "@nestjs/common";
import { type RelationsFilterColumns, eq } from "drizzle-orm";
import type { DBQueryConfigWith, RelationsRecord } from "drizzle-orm/relations";
import { type User, type UserCreate, type relations, users } from "openselves-common/db";

import { InjectDb } from "../../db/db.service.js";
import type { DB } from "../../db/drizzle.js";

@Injectable()
export class UserService {
	constructor(@InjectDb() private readonly db: DB) {}

	async getUser(
		where: RelationsFilterColumns<typeof users._.columns>,
		options: {
			with?: DBQueryConfigWith<typeof relations, RelationsRecord>;
		} = {},
	): Promise<Omit<User, "passwordHash"> | undefined> {
		const userWithPassword = await this.getUserWithPassword(where, options);
		if (!userWithPassword) {
			return undefined;
		}

		const { passwordHash, ...userWithoutPassword } = userWithPassword;
		return userWithoutPassword;
	}

	async getUserWithPassword(
		where: RelationsFilterColumns<typeof users._.columns>,
		options: {
			with?: DBQueryConfigWith<typeof relations, RelationsRecord>;
		} = {},
	): Promise<User | undefined> {
		return this.db.query.users.findFirst({
			where: where,
			with: options?.with,
		});
	}

	async createUser(data: UserCreate): Promise<User> {
		const rawResult = await this.db.insert(users).values(data).returning();
		return rawResult[0];
	}

	async updateUser(userId: User["id"], data: Partial<UserCreate>): Promise<User | undefined> {
		return (await this.db.update(users).set(data).where(eq(users.id, userId)).returning())[0];
	}

	async deleteUser(userId: User["id"]): Promise<User | undefined> {
		return (await this.db.delete(users).where(eq(users.id, userId)).returning())[0];
	}

	public async hashPassword(password: string) {
		return argon2.hash(password);
	}

	public async verifyPassword(user: User, password: string) {
		return await argon2.verify(user.passwordHash, password);
	}
}

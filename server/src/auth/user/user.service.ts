import * as argon2 from "argon2";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type RelationsFilterColumns, and, eq } from "drizzle-orm";
import type { DBQueryConfigWith, RelationsRecord } from "drizzle-orm/relations";
import { type User, type UserCreate, type relations, users } from "openselves-common/db";

import type { ConfigData } from "../../config.data.js";
import { InjectDb } from "../../db/db.service.js";
import type { DB } from "../../db/drizzle.js";

@Injectable()
export class UserService {
	constructor(
		private readonly config: ConfigService<ConfigData>,
		@Inject(CACHE_MANAGER)
		private readonly cache: Cache,
		@InjectDb() private readonly db: DB,
	) {}

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
		const createdUser = (await this.db.insert(users).values(data).returning())[0];
		this.sendEmailVerificationEmail(createdUser);
		return createdUser;
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

	public async verifyUserEmail(userId: string, emailVerificationToken: string): Promise<boolean> {
		const cacheKey = "UserService.verifyUserEmail." + userId + "." + emailVerificationToken;
		if ((await this.cache.get(cacheKey)) === true) {
			return true;
		}

		const updatedUsers = await this.db
			.update(users)
			.set({
				isEmailVerified: true,
			})
			.where(
				and(eq(users.id, userId), eq(users.emailVerificationToken, emailVerificationToken)),
			)
			.returning();

		const isVerified = updatedUsers.length > 0;
		if (isVerified) {
			await this.cache.set(cacheKey, true);
		}
		return isVerified;
	}

	private sendEmailVerificationEmail(createdUser: User) {
		const link =
			this.config.getOrThrow("PUBLIC_URL", { infer: true }) +
			"/user/" +
			createdUser.id +
			"/verify-email/" +
			createdUser.emailVerificationToken;
		console.debug("User created, email verification link:", link);
	}
}

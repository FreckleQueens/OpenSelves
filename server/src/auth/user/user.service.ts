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
import { Mail } from "../mail/mail.js";
import { MailService } from "../mail/mail.service.js";

@Injectable()
export class UserService {
	constructor(
		private readonly config: ConfigService<ConfigData>,
		@Inject(CACHE_MANAGER)
		private readonly cache: Cache,
		@InjectDb() private readonly db: DB,
		private readonly mailService: MailService,
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
		await this.sendEmailVerificationEmail(createdUser);
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

	public async resendVerificationEmail(user: Omit<User, "passwordHash">) {
		await this.sendEmailVerificationEmail(user);
	}

	private async sendEmailVerificationEmail(user: Omit<User, "passwordHash">) {
		const link =
			this.config.getOrThrow("CLIENT_PUBLIC_URL", { infer: true }) +
			"/verify-email/" +
			user.id +
			"/" +
			user.emailVerificationToken;
		await this.mailService.send(
			new Mail(
				user.email,
				this.config.getOrThrow("EMAIL_FROM_ADDRESS", { infer: true }),
				this.config.getOrThrow("EMAIL_FROM_NAME", { infer: true }),
				"Verify your account's email address",
				[
					"Hi!",
					"",
					"Thanks for creating an account on " +
						this.config.getOrThrow("PUBLIC_URL", { infer: true }),
					"If it was not you, you can safely disregard this email.",
					"If it was you, please open the following link in your browser to validate your email address:",
					link,
					"",
					"This email is intended for " +
						user.email +
						" and was sent by the OpenSelves instance at " +
						this.config.getOrThrow("PUBLIC_URL", { infer: true }),
				].join("\n"),
			),
		);
	}
}

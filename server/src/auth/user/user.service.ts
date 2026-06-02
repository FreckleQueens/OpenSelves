import * as argon2 from "argon2";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { randomBytes } from "crypto";
import { type RelationsFilterColumns, and, eq, lt } from "drizzle-orm";
import type { DBQueryConfigWith, RelationsRecord } from "drizzle-orm/relations";
import { type User, type UserCreate, type relations, users } from "openselves-common/db";

import type { ConfigData } from "../../config.data.js";
import { InjectDb } from "../../db/db.service.js";
import type { DB } from "../../db/drizzle.js";
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

	public async getUser(
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

	public async getUserWithPassword(
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

	public async createUser(data: UserCreate): Promise<User> {
		const createdUser = (await this.db.insert(users).values(data).returning())[0];
		await this.sendEmailVerificationEmail(createdUser);
		return createdUser;
	}

	public async updateUser(
		userId: User["id"],
		data: Partial<UserCreate>,
	): Promise<User | undefined> {
		return (await this.db.update(users).set(data).where(eq(users.id, userId)).returning())[0];
	}

	public async deleteUser(userId: User["id"]): Promise<User | undefined> {
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

	public async recoverPassword(userId: string, token: string, password: string) {
		const user = (
			await this.db
				.update(users)
				.set({
					passwordHash: await this.hashPassword(password),
					passwordRecoveryToken: null,
				})
				.where(and(eq(users.id, userId), eq(users.passwordRecoveryToken, token)))
				.returning()
		)[0];
		return !!user;
	}

	/**
	 * @return true if user was found, false if user was not found
	 */
	public async sendPasswordRecoveryEmail(email: string): Promise<boolean> {
		const user = (
			await this.db
				.update(users)
				.set({
					passwordRecoveryToken: Buffer.from(randomBytes(32)).toString("hex"),
				})
				.where(eq(users.email, email))
				.returning()
		)[0];
		if (!user) {
			return false;
		}

		const link =
			this.config.getOrThrow("CLIENT_PUBLIC_URL", { infer: true }) +
			"/auth/recover-password/" +
			user.id +
			"/" +
			user.passwordRecoveryToken;
		await this.mailService.sendServiceEmail(
			user.email,
			"Account password recovery",
			[
				"Hi!",
				"",
				"Password recovery was requested for the account associated with your email address on " +
					this.config.getOrThrow("PUBLIC_URL", { infer: true }),
				"If it was not you, you can safely disregard this email.",
				"If it was you, please open the following link to change your password:",
				link,
			].join("\n"),
		);

		return true;
	}

	@Cron(CronExpression.EVERY_DAY_AT_3AM)
	public async cullUnverifiedUsers() {
		console.log("Culling unverified accounts...");
		const unverifiedAccountCullingDelay = this.config.getOrThrow(
			"UNVERIFIED_ACCOUNT_CULLING_DELAY",
			{ infer: true },
		);
		const deletedUsers = await this.db
			.delete(users)
			.where(
				and(
					eq(users.isEmailVerified, false),
					lt(users.createdAt, new Date(Date.now() - unverifiedAccountCullingDelay)),
				),
			)
			.returning();
		if (deletedUsers.length) {
			console.log("Successfully culled", deletedUsers.length, "users.");
		} else {
			console.log("No user to cull.");
		}
	}

	private async sendEmailVerificationEmail(user: Omit<User, "passwordHash">) {
		const link =
			this.config.getOrThrow("CLIENT_PUBLIC_URL", { infer: true }) +
			"/verify-email/" +
			user.id +
			"/" +
			user.emailVerificationToken;
		await this.mailService.sendServiceEmail(
			user.email,
			"Verify your account's email address",
			[
				"Hi!",
				"",
				"Thanks for creating an account on " +
					this.config.getOrThrow("PUBLIC_URL", { infer: true }),
				"If it was not you, you can safely disregard this email.",
				"If it was you, please open the following link in your browser to validate your email address:",
				link,
			].join("\n"),
		);
	}
}

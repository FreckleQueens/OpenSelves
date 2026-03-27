import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { randomBytes } from "crypto";
import { type RelationsFilterColumns, and, eq, gte } from "drizzle-orm";
import { type PartialBy } from "openselves-common";
import { type Session, type User, sessions } from "openselves-common/db";

import { type ConfigData } from "../../config.data.js";
import { InjectDb } from "../db/db.service.js";
import type { DB } from "../db/drizzle.js";
import { AccessTokenPayload } from "./data/access-token-payload.data.js";

@Injectable()
export class SessionService {
	constructor(
		@InjectDb()
		private readonly db: DB,
		private readonly configService: ConfigService<ConfigData>,
		private readonly jwtService: JwtService,
	) {}

	public async getSession(where: RelationsFilterColumns<typeof sessions._.columns>): Promise<
		| (Session & {
				user: User | null;
		  })
		| undefined
	> {
		return this.db.query.sessions.findFirst({
			where: where,
			with: {
				user: true,
			},
		});
	}

	public async makeAccessToken(user: PartialBy<User, "passwordHash">) {
		const { passwordHash, ...userWithoutPasswordHash } = user;
		return await this.jwtService.signAsync<AccessTokenPayload>({
			user: userWithoutPasswordHash,
		});
	}

	public async createSession(userId: User["id"]): Promise<Session> {
		const token = this.generateNewSessionToken();
		return (
			await this.db.insert(sessions).values({ token: token, userId: userId }).returning()
		)[0];
	}

	public hasSessionExpired(session: Session): boolean {
		const refreshTokenDuration = this.configService.getOrThrow("REFRESH_TOKEN_DURATION", {
			infer: true,
		});
		return Date.now() - session.updatedAt.getTime() >= refreshTokenDuration * 1000;
	}

	public async refreshSession(token: string): Promise<Session | undefined> {
		const refreshTokenDuration = this.configService.getOrThrow("REFRESH_TOKEN_DURATION", {
			infer: true,
		});
		const newToken = this.generateNewSessionToken();
		return (
			await this.db
				.update(sessions)
				.set({ token: newToken })
				.where(
					and(
						eq(sessions.token, token),
						gte(sessions.updatedAt, new Date(Date.now() - refreshTokenDuration * 1000)),
					),
				)
				.returning()
		)[0];
	}

	public async revokeSession(token: string): Promise<Session | undefined> {
		const refreshTokenDuration = this.configService.getOrThrow("REFRESH_TOKEN_DURATION", {
			infer: true,
		});
		return (
			await this.db
				.delete(sessions)
				.where(
					and(
						eq(sessions.token, token),
						gte(sessions.updatedAt, new Date(Date.now() - refreshTokenDuration * 1000)),
					),
				)
				.returning()
		)[0];
	}

	private generateNewSessionToken() {
		const refreshTokenSize = this.configService.getOrThrow("REFRESH_TOKEN_SIZE", {
			infer: true,
		});
		return Buffer.from(randomBytes(refreshTokenSize)).toString("hex");
	}
}

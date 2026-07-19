import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createId } from "@paralleldrive/cuid2";
import { randomBytes } from "crypto";
import { type RelationsFilterColumns, and, eq, gte, or } from "drizzle-orm";
import { type PartialBy } from "openselves-common";

import { type ConfigData } from "../../config.data.js";
import { DB } from "../../db/drizzle.js";
import { type Session, type User, sessions } from "../../db/index.js";
import { AccessTokenPayload } from "./data/access-token-payload.data.js";

@Injectable()
export class SessionService {
	constructor(
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
			uniqueId: createId(),
			timestampMs: Date.now(),
			user: userWithoutPasswordHash,
		});
	}

	public async createSession(userId: User["id"], persistSession: boolean): Promise<Session> {
		const token = this.generateNewSessionToken();
		return (
			await this.db
				.insert(sessions)
				.values({ token, userId, persist: persistSession })
				.returning()
		)[0];
	}

	public hasSessionExpired(session: Session): boolean {
		const refreshTokenDuration = this.configService.getOrThrow(
			session.persist ? "REFRESH_TOKEN_DURATION" : "REFRESH_TOKEN_SHORT_DURATION",
			{
				infer: true,
			},
		);
		const ttl = refreshTokenDuration * 1000;

		const timeSinceLastUpdate = Date.now() - session.updatedAt.getTime();
		return timeSinceLastUpdate >= ttl;
	}

	public async refreshSession(
		token: string,
		persistSession: boolean,
	): Promise<Session | undefined> {
		const refreshTokenDuration = this.configService.getOrThrow(
			persistSession ? "REFRESH_TOKEN_DURATION" : "REFRESH_TOKEN_SHORT_DURATION",
			{
				infer: true,
			},
		);
		const ttl = refreshTokenDuration * 1000;

		const newToken = this.generateNewSessionToken();
		return (
			await this.db
				.update(sessions)
				.set({ token: newToken })
				.where(
					and(
						eq(sessions.token, token),
						gte(sessions.updatedAt, new Date(Date.now() - ttl)),
						eq(sessions.persist, persistSession),
					),
				)
				.returning()
		)[0];
	}

	public async revokeSession(token: string): Promise<Session | undefined> {
		const refreshTokenDuration = this.configService.getOrThrow("REFRESH_TOKEN_DURATION", {
			infer: true,
		});
		const shortRefreshTokenDuration = this.configService.getOrThrow(
			"REFRESH_TOKEN_SHORT_DURATION",
			{
				infer: true,
			},
		);
		return (
			await this.db
				.delete(sessions)
				.where(
					and(
						eq(sessions.token, token),
						or(
							and(
								eq(sessions.persist, true),
								gte(
									sessions.updatedAt,
									new Date(Date.now() - refreshTokenDuration * 1000),
								),
							),
							and(
								eq(sessions.persist, false),
								gte(
									sessions.updatedAt,
									new Date(Date.now() - shortRefreshTokenDuration * 1000),
								),
							),
						),
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

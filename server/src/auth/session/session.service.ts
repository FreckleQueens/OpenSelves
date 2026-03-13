import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomBytes } from "crypto";

import { Session, User } from "../../generated/prisma/client";
import { SessionWhereUniqueInput } from "../../generated/prisma/models/Session";
import { PrismaService } from "../../prisma.service";
import { AccessTokenPayload } from "./data/access-token-payload.data";

@Injectable()
export class SessionService {
	constructor(
		private readonly prismaService: PrismaService,
		private readonly jwtService: JwtService,
	) {}

	public async session(where: SessionWhereUniqueInput) {
		return this.prismaService.session.findUnique({ where, include: { user: true } });
	}

	public async makeAccessToken(user: User) {
		const { passwordHash, ...userWithoutPasswordHash } = user;
		return await this.jwtService.signAsync<AccessTokenPayload>({
			user: userWithoutPasswordHash,
		});
	}

	public async createSession(user: User) {
		return this.prismaService.session.create({
			data: { token: this.generateNewSessionToken(), userId: user.id },
		});
	}

	public hasSessionExpired(session: Session) {
		const refreshTokenDuration = process.env["REFRESH_TOKEN_DURATION"];
		if (!refreshTokenDuration) {
			throw new Error("REFRESH_TOKEN_DURATION env variable not defined");
		}
		return Date.now() - session.updatedAt.getTime() >= parseInt(refreshTokenDuration) * 1000;
	}

	public async refreshSession(token: string) {
		const newToken = this.generateNewSessionToken();
		return this.prismaService.session.update({
			data: { token: newToken },
			where: { token: token },
			include: { user: true },
		});
	}

	public async revokeSession(token: string) {
		const refreshTokenDuration = process.env["REFRESH_TOKEN_DURATION"];
		if (!refreshTokenDuration) {
			throw new Error("REFRESH_TOKEN_DURATION env variable not defined");
		}
		return this.prismaService.session.delete({
			where: {
				token: token,
				AND: {
					updatedAt: {
						gte: new Date(Date.now() - parseInt(refreshTokenDuration) * 1000),
					},
				},
			},
		});
	}

	private generateNewSessionToken() {
		const refreshTokenSize = process.env["REFRESH_TOKEN_SIZE"];
		if (!refreshTokenSize) {
			throw new Error("REFRESH_TOKEN_SIZE env variable not defined");
		}
		return Buffer.from(randomBytes(parseInt(refreshTokenSize))).toString("hex");
	}
}

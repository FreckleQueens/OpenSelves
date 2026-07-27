import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	NotFoundException,
	Post,
	Req,
	Res,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createId } from "@paralleldrive/cuid2";
import type { Request, Response } from "express";
import { MISSING_REFRESH_TOKEN_COOKIE, SESSION_EXPIRED_ERROR } from "openselves-common";
import { ByteString, Ed25519 } from "openselves-common/willow";

import { Captcha } from "../captcha/decorators/captcha.decorator.js";
import { type ConfigData } from "../config.data.js";
import type { ChallengeData } from "./data/challenge.data.js";
import { GetChallengeDto } from "./data/get-challenge.dto.js";
import { LoginDto } from "./data/login.dto.js";
import { Public } from "./decorators/public.decorator.js";
import { SessionService } from "./session/session.service.js";

@Controller("auth")
export class AuthController {
	constructor(
		private readonly configService: ConfigService<ConfigData>,
		private readonly sessionService: SessionService,
		private readonly jwtService: JwtService,
	) {}

	@Public()
	@Post("challenge")
	@HttpCode(HttpStatus.OK)
	@Captcha()
	public async getChallenge(@Body() getChallengeDto: GetChallengeDto) {
		return {
			challenge: await this.jwtService.signAsync<ChallengeData>(
				{
					uniqueId: createId(),
					timestampMs: Date.now(),
					userKey: getChallengeDto.userKey.toBase64(),
				},
				{
					expiresIn: this.configService.getOrThrow("AUTH_CHALLENGE_DURATION", {
						infer: true,
					}),
				},
			),
		};
	}

	@Public()
	@Post("login")
	@HttpCode(HttpStatus.OK)
	public async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
		let challengePayload: ChallengeData;
		try {
			challengePayload = await this.jwtService.verifyAsync<ChallengeData>(loginDto.challenge);
		} catch (e) {
			throw new UnauthorizedException("Invalid challenge payload", { cause: e });
		}

		const userKey = ByteString.fromBase64(challengePayload.userKey);
		if (
			!(await Ed25519.verify(
				userKey,
				loginDto.signature,
				ByteString.fromUtf8(loginDto.challenge),
			))
		) {
			throw new UnauthorizedException("Invalid signature", { cause: loginDto.signature });
		}

		const session = await this.sessionService.createSession(userKey, !!loginDto.persistSession);
		const accessToken = await this.sessionService.makeAccessToken(session);
		this.setAuthCookies(accessToken, session.token, session.persist, response);
		return {};
	}

	@Public()
	@Post("refresh")
	@HttpCode(HttpStatus.OK)
	public async refreshAuth(
		@Req() request: Request,
		@Res({ passthrough: true }) response: Response,
	) {
		const refreshToken = this.getRefreshTokenFromRequest(request);

		const session = await this.sessionService.getSessionByToken(refreshToken);
		if (!session) {
			throw new UnauthorizedException({
				name: SESSION_EXPIRED_ERROR,
				description: "Invalid token (session not found or token revoked)",
			});
		}

		if (this.sessionService.hasSessionExpired(session)) {
			throw new UnauthorizedException({
				name: SESSION_EXPIRED_ERROR,
				description: "Invalid token (session expired)",
			});
		}

		const newSession = await this.sessionService.refreshSession(session.token, session.persist);
		if (!newSession) {
			throw new UnauthorizedException("Invalid token (session not found or token revoked)");
		}

		const accessToken = await this.sessionService.makeAccessToken(newSession);
		this.setAuthCookies(accessToken, newSession.token, session.persist, response);
		return {};
	}

	@Public()
	@Post("logout")
	@HttpCode(HttpStatus.OK)
	public async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
		const refreshToken = this.getRefreshTokenFromRequest(request);
		try {
			const revokedSession = await this.sessionService.revokeSession(refreshToken);
			if (!revokedSession) {
				throw new NotFoundException("Session to revoke not found");
			}
		} catch (e) {
			throw new UnauthorizedException(e);
		}
		response.cookie("accessToken", "", { expires: new Date(0) });
		response.cookie("refreshToken", "", { expires: new Date(0) });
		return {};
	}

	private getRefreshTokenFromRequest(request: Request) {
		const refreshToken = request.cookies["refreshToken"] as unknown;
		if (typeof refreshToken !== "string") {
			throw new UnauthorizedException({
				name: MISSING_REFRESH_TOKEN_COOKIE,
				description: "Missing refreshToken cookie",
			});
		}
		return refreshToken;
	}

	private setAuthCookies(
		accessToken: string,
		refreshToken: string,
		persistSession: boolean,
		response: Response,
	) {
		response.cookie("accessToken", accessToken, {
			httpOnly: true,
			maxAge: this.configService.getOrThrow("ACCESS_TOKEN_DURATION", { infer: true }) * 1000,
		});
		response.cookie("refreshToken", refreshToken, {
			httpOnly: true,
			maxAge:
				this.configService.getOrThrow(
					persistSession ? "REFRESH_TOKEN_DURATION" : "REFRESH_TOKEN_SHORT_DURATION",
					{ infer: true },
				) * 1000,
		});
	}
}

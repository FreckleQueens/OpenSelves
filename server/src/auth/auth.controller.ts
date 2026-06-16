import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	InternalServerErrorException,
	NotFoundException,
	Post,
	Req,
	Res,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { MISSING_REFRESH_TOKEN_COOKIE, SESSION_EXPIRED_ERROR } from "openselves-common";

import { type ConfigData } from "../config.data.js";
import { LoginDto } from "./data/login.dto.js";
import { Public } from "./decorators/public.decorator.js";
import { SessionService } from "./session/session.service.js";
import { UserService } from "./user/user.service.js";

@Controller("auth")
export class AuthController {
	constructor(
		private readonly configService: ConfigService<ConfigData>,
		private readonly userService: UserService,
		private readonly sessionService: SessionService,
	) {}

	@Public()
	@Post("login")
	@HttpCode(HttpStatus.OK)
	public async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
		const user = await this.userService.getUserWithPassword({ email: loginDto.email });
		if (user && (await this.userService.verifyPassword(user, loginDto.password))) {
			const session = await this.sessionService.createSession(
				user.id,
				!!loginDto.persistSession,
			);
			const accessToken = await this.sessionService.makeAccessToken(user);
			this.setAuthCookies(accessToken, session.token, session.persist, response);
			return {
				userId: user.id,
			};
		}

		throw new UnauthorizedException("Incorrect email or password");
	}

	@Public()
	@Post("refresh")
	@HttpCode(HttpStatus.OK)
	public async refreshAuth(
		@Req() request: Request,
		@Res({ passthrough: true }) response: Response,
	) {
		const refreshToken = this.getRefreshTokenFromRequest(request);

		const session = await this.sessionService.getSession({ token: refreshToken });
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

		const user = session.user;
		if (user === null) {
			throw new InternalServerErrorException("User was not loaded with old session");
		}

		const newSession = await this.sessionService.refreshSession(session.token, session.persist);
		if (!newSession) {
			throw new UnauthorizedException("Invalid token (session not found or token revoked)");
		}

		const accessToken = await this.sessionService.makeAccessToken(user);
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

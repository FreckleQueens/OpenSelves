import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Post,
	Req,
	Res,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";

import { ConfigData } from "../config.data";
import { LoginDto } from "./data/login.dto";
import { Public } from "./decorators/public.decorator";
import { SessionService } from "./session/session.service";
import { UserService } from "./user/user.service";

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
		const user = await this.userService.user(
			{ email: loginDto.email },
			{ withPasswordHash: true },
		);
		if (user && (await this.userService.verifyPassword(user, loginDto.password))) {
			const session = await this.sessionService.createSession(user);
			const accessToken = await this.sessionService.makeAccessToken(user);
			this.setAuthCookies(accessToken, session.token, response);
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

		const session = await this.sessionService.session({ token: refreshToken });
		if (!session) {
			throw new UnauthorizedException("Invalid token (session not found or token revoked)");
		}

		if (this.sessionService.hasSessionExpired(session)) {
			throw new UnauthorizedException("Session expired");
		}

		const newSession = await this.sessionService.refreshSession(session.token);
		const accessToken = await this.sessionService.makeAccessToken(newSession.user);
		this.setAuthCookies(accessToken, newSession.token, response);
		return {};
	}

	@Public()
	@Post("logout")
	@HttpCode(HttpStatus.OK)
	public async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
		const refreshToken = this.getRefreshTokenFromRequest(request);
		try {
			await this.sessionService.revokeSession(refreshToken);
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
			throw new UnauthorizedException("Missing refreshToken cookie");
		}
		return refreshToken;
	}

	private setAuthCookies(accessToken: string, refreshToken: string, response: Response) {
		response.cookie("accessToken", accessToken, {
			httpOnly: true,
			maxAge: this.configService.getOrThrow("ACCESS_TOKEN_DURATION", { infer: true }) * 1000,
		});
		response.cookie("refreshToken", refreshToken, {
			httpOnly: true,
			maxAge: this.configService.getOrThrow("REFRESH_TOKEN_DURATION", { infer: true }) * 1000,
		});
	}
}

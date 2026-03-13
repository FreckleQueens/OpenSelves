import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Post,
	UnauthorizedException,
} from "@nestjs/common";

import { LoginDto } from "./data/login.dto";
import { LogoutDto } from "./data/logout.dto";
import { RefreshAuthDto } from "./data/refresh-auth.dto";
import { Public } from "./decorators/public.decorator";
import { SessionService } from "./session/session.service";
import { UserService } from "./user/user.service";

@Controller("auth")
export class AuthController {
	constructor(
		private readonly userService: UserService,
		private readonly sessionService: SessionService,
	) {}

	@Public({ allowAuthenticatedUsers: false })
	@Post("/login")
	@HttpCode(HttpStatus.OK)
	public async login(@Body() loginDto: LoginDto) {
		const user = await this.userService.user(
			{ email: loginDto.email },
			{ withPasswordHash: true },
		);
		if (user && (await this.userService.verifyPassword(user, loginDto.password))) {
			const session = await this.sessionService.createSession(user);
			return {
				accessToken: await this.sessionService.makeAccessToken(user),
				refreshToken: session.token,
			};
		}

		throw new UnauthorizedException("Incorrect email or password");
	}

	@Public()
	@Post("/refresh")
	@HttpCode(HttpStatus.OK)
	public async refreshAuth(@Body() refreshAuthDto: RefreshAuthDto) {
		const session = await this.sessionService.session({ token: refreshAuthDto.refreshToken });
		if (!session) {
			throw new UnauthorizedException("Invalid token (session not found or token revoked)");
		}

		if (this.sessionService.hasSessionExpired(session)) {
			throw new UnauthorizedException("Session expired");
		}

		const newSession = await this.sessionService.refreshSession(session.token);
		return {
			accessToken: await this.sessionService.makeAccessToken(newSession.user),
			refreshToken: newSession.token,
		};
	}

	@Public()
	@Post("/logout")
	@HttpCode(HttpStatus.OK)
	public async logout(@Body() logoutDto: LogoutDto) {
		try {
			await this.sessionService.revokeSession(logoutDto.refreshToken);
		} catch (e) {
			throw new UnauthorizedException(e);
		}
		return {};
	}
}

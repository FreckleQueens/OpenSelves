import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Post,
	UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { JwtPayload } from "./data/jwt-payload.data";
import { LoginDto } from "./data/login.dto";
import { Public } from "./decorators/public.decorator";
import { UserService } from "./user/user.service";

@Controller("auth")
export class AuthController {
	constructor(
		private readonly userService: UserService,
		private readonly jwtService: JwtService,
	) {}

	@Public({ allowAuthenticatedUsers: false })
	@Post("/login")
	@HttpCode(HttpStatus.OK)
	public async login(@Body() loginDto: LoginDto) {
		const user = await this.userService.userWithPasswordHash({ email: loginDto.email });
		if (user && (await this.userService.verifyPassword(user, loginDto.password))) {
			const { passwordHash, ...userWithoutPasswordHash } = user;
			return {
				accessToken: await this.jwtService.signAsync<JwtPayload>({
					user: userWithoutPasswordHash,
				}),
			};
		}

		throw new UnauthorizedException("Incorrect email or password");
	}
}

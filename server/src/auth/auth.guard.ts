import {
	type CanActivate,
	type ExecutionContext,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { type Request } from "express";
import { TOKEN_EXPIRED_ERROR } from "openselves-common";

import { Public } from "./decorators/public.decorator.js";

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		private readonly jwtService: JwtService,
		private readonly reflector: Reflector,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const publicAccessSettings = this.reflector.getAllAndOverride(Public, [
			context.getHandler(),
			context.getClass(),
		]);
		const isPublic = !!publicAccessSettings;

		const request = context.switchToHttp().getRequest<Request>();
		const authToken = this.extractTokenFromCookies(request);

		if (isPublic) {
			if (!publicAccessSettings.allowAuthenticatedUsers && authToken !== undefined) {
				throw new UnauthorizedException();
			} else {
				return true;
			}
		}

		if (authToken === undefined) {
			throw new UnauthorizedException({
				name: TOKEN_EXPIRED_ERROR,
			});
		}

		try {
			request.accessTokenPayload = await this.jwtService.verifyAsync(authToken);
		} catch (error) {
			throw new UnauthorizedException(error);
		}
		return true;
	}

	private extractTokenFromCookies(request: Request): string | undefined {
		const refreshToken = request.cookies["accessToken"] as unknown;
		if (typeof refreshToken !== "string") {
			return undefined;
		}
		return refreshToken;
	}
}

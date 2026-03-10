import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";

import { Public } from "./decorators/public.decorator";

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
		const authToken = this.extractTokenFromHeader(request);

		if (isPublic) {
			if (!publicAccessSettings.allowAuthenticatedUsers && authToken !== undefined) {
				throw new UnauthorizedException();
			} else {
				return true;
			}
		}

		if (authToken === undefined) {
			throw new UnauthorizedException();
		}

		try {
			request.jwtPayload = await this.jwtService.verifyAsync(authToken);
		} catch {
			throw new UnauthorizedException("Invalid Authorization token");
		}
		return true;
	}

	private extractTokenFromHeader(request: Request): string | undefined {
		const [type, token] = request.headers.authorization?.split(" ") ?? [];
		return type === "Bearer" ? token : undefined;
	}
}

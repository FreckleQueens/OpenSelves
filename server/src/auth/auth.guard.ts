import {
	type CanActivate,
	type ExecutionContext,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type Request } from "express";
import { TOKEN_EXPIRED_ERROR } from "openselves-common";

import { Public } from "./decorators/public.decorator.js";

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	public canActivate(context: ExecutionContext): boolean {
		const publicAccessSettings = this.reflector.getAllAndOverride(Public, [
			context.getHandler(),
			context.getClass(),
		]);
		const isPublic = !!publicAccessSettings;

		const request = context.switchToHttp().getRequest<Request>();
		const { accessTokenPayload, accessTokenParseError } = request;

		if (isPublic) {
			if (!publicAccessSettings.allowAuthenticatedUsers && accessTokenPayload !== undefined) {
				throw new UnauthorizedException();
			} else {
				return true;
			}
		}

		if (accessTokenPayload === undefined) {
			throw new UnauthorizedException(
				{
					name: TOKEN_EXPIRED_ERROR,
				},
				{
					cause: accessTokenParseError,
				},
			);
		}

		return true;
	}
}

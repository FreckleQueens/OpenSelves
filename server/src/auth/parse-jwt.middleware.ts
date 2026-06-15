import { Injectable, type NestMiddleware } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { NextFunction, Request, Response } from "express";

@Injectable()
export class ParseJwtMiddleware implements NestMiddleware {
	constructor(private readonly jwtService: JwtService) {}

	public async use(request: Request, response: Response, next: NextFunction) {
		const authToken = this.extractTokenFromCookies(request);

		if (authToken) {
			try {
				request.accessTokenPayload = await this.jwtService.verifyAsync(authToken);
			} catch (error) {
				request.accessTokenParseError = error;
			}
		}

		next();
	}

	private extractTokenFromCookies(request: Request): string | undefined {
		const refreshToken = request.cookies["accessToken"] as unknown;
		if (typeof refreshToken !== "string") {
			return undefined;
		}
		return refreshToken;
	}
}

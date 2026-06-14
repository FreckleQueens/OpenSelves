import {
	BadRequestException,
	Injectable,
	type NestMiddleware,
	UnauthorizedException,
} from "@nestjs/common";
import type { Challenge, Solution } from "altcha-lib";
import type { NextFunction } from "express";
import type { Request, Response } from "express";

import { CaptchaService } from "./captcha.service.js";

@Injectable()
export class CaptchaMiddleware implements NestMiddleware {
	constructor(private readonly captchaService: CaptchaService) {}

	async use(request: Request, response: Response, next: NextFunction) {
		const payload: unknown = (request.body as unknown)?.["captcha"];
		if (!payload) {
			throw new BadRequestException("Missing captcha field");
		}

		if (!this.isValidPayload(payload)) {
			throw new BadRequestException("Invalid captcha payload");
		}

		if (!(await this.captchaService.verifySolution(payload.challenge, payload.solution))) {
			throw new UnauthorizedException("Captcha is invalid or has expired.");
		}

		const email = payload.challenge.parameters.data?.["sendEmailActionEmail"];
		if (typeof email === "string") {
			request.sendEmailActionEmail = email;
		}

		next();
	}

	private isValidPayload(
		payload: unknown,
	): payload is { challenge: Challenge; solution: Solution } {
		return !!(
			payload &&
			typeof payload === "object" &&
			"challenge" in payload &&
			payload.challenge &&
			"solution" in payload &&
			payload.solution
		);
	}
}

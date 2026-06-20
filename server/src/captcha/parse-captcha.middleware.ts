import { BadRequestException, Injectable, type NestMiddleware } from "@nestjs/common";
import type { Challenge, Solution } from "altcha-lib";
import type { NextFunction } from "express";
import type { Request, Response } from "express";

@Injectable()
export class ParseCaptchaMiddleware implements NestMiddleware {
	use(request: Request, response: Response, next: NextFunction) {
		const payload: unknown = (request.body as unknown)?.["captcha"];
		if (!payload) {
			return next();
		}

		if (!this.isValidPayload(payload)) {
			throw new BadRequestException("Invalid captcha payload");
		}

		request.captchaPayload = payload;

		const email = payload.challenge.parameters.data?.["sendEmailActionEmail"];
		if (typeof email === "string") {
			request.sendEmailActionEmail = email;
		}

		next();
	}

	private isValidPayload(
		payload: unknown,
	): payload is { challenge: Challenge; solution: Solution } {
		if (!payload || typeof payload !== "object") {
			return false;
		}

		if (
			!("challenge" in payload) ||
			!payload.challenge ||
			typeof payload.challenge !== "object"
		) {
			return false;
		}
		const challenge = payload.challenge;
		if (!("parameters" in challenge)) {
			return false;
		}

		if (!("solution" in payload) || !payload.solution || typeof payload.solution !== "object") {
			return false;
		}
		const solution = payload.solution;
		if (["counter", "derivedKey"].find((prop) => !(prop in solution))) {
			return false;
		}

		return true;
	}
}

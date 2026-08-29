import { BadRequestException, Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction } from "express";
import type { Request, Response } from "express";
import { isValidSchemaStatic } from "openselves-common/schema";

import { captchaSchema } from "./captcha-type-helpers.js";

@Injectable()
export class ParseCaptchaMiddleware implements NestMiddleware {
	use(request: Request, response: Response, next: NextFunction) {
		const payload: unknown = (request.body as unknown)?.["captcha"];
		if (!payload) {
			return next();
		}

		if (!isValidSchemaStatic(captchaSchema, payload)) {
			throw new BadRequestException("Invalid captcha payload");
		}

		request.captchaPayload = payload;

		const email: unknown = payload.challenge.parameters.data?.["sendEmailActionEmail"];
		if (typeof email === "string") {
			request.sendEmailActionEmail = email;
		}

		next();
	}
}

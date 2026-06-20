import {
	BadRequestException,
	type CanActivate,
	type ExecutionContext,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type Request } from "express";

import { CaptchaService } from "./captcha.service.js";
import { Captcha } from "./decorators/captcha.decorator.js";

@Injectable()
export class CaptchaGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		private readonly captchaService: CaptchaService,
	) {}

	public async canActivate(context: ExecutionContext): Promise<boolean> {
		const captchaSettings = this.reflector.getAllAndOverride(Captcha, [
			context.getHandler(),
			context.getClass(),
		]);
		if (!captchaSettings) {
			return true;
		}

		const request = context.switchToHttp().getRequest<Request>();
		const payload = request.captchaPayload;
		if (!payload) {
			throw new BadRequestException("Missing captcha field");
		}

		if (!(await this.captchaService.verifySolution(payload.challenge, payload.solution))) {
			throw new UnauthorizedException("Captcha is invalid or has expired.");
		}

		return true;
	}
}

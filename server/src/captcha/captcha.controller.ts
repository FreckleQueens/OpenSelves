import { Controller, Get, Req } from "@nestjs/common";
import { type Request } from "express";

import { Public } from "../auth/decorators/public.decorator.js";
import { CaptchaService } from "./captcha.service.js";

@Controller("captcha")
export class CaptchaController {
	constructor(private readonly captchaService: CaptchaService) {}

	@Public()
	@Get("challenge")
	public async generateChallenge(@Req() request: Request) {
		await this.captchaService.increaseGenericFactorsFromRequest(request);
		const factor = await this.captchaService.getFactorFromRequest(request);
		return await this.captchaService.createChallenge(factor);
	}
}

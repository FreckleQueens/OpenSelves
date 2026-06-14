import { BadRequestException, Controller, Get, Param, Req } from "@nestjs/common";
import { type Request } from "express";

import { Public } from "../auth/decorators/public.decorator.js";
import { CaptchaService } from "./captcha.service.js";
import { GetChallengeParams } from "./data/get-challenge.params.js";

@Controller("captcha")
export class CaptchaController {
	constructor(private readonly captchaService: CaptchaService) {}

	@Get("challenge{/:action/:actionValue}")
	@Public()
	public async generateChallenge(@Req() request: Request, @Param() params: GetChallengeParams) {
		if (params.action) {
			switch (params.action) {
				case "sendEmail":
					if (!params.actionValue) {
						throw new BadRequestException("sendEmail action requires actionValue");
					}
					request.sendEmailActionEmail = params.actionValue;
					break;
				default:
					throw new BadRequestException("Unsupported action", { cause: params.action });
			}
		}

		await this.captchaService.increaseGenericFactorsFromRequest(request);
		const factor = await this.captchaService.getFactorFromRequest(request);
		return await this.captchaService.createChallenge(factor, request.sendEmailActionEmail);
	}
}

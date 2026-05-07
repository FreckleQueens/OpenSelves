import { Controller, Get } from "@nestjs/common";

import { Public } from "../auth/decorators/public.decorator.js";
import { CaptchaService } from "./captcha.service.js";

@Controller("captcha")
export class CaptchaController {
	constructor(private readonly captchaService: CaptchaService) {}

	@Public()
	@Get("challenge")
	public async generateChallenge() {
		return await this.captchaService.createChallenge();
	}
}

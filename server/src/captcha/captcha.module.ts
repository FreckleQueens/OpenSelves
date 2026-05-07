import { Module } from "@nestjs/common";

import { CaptchaController } from "./captcha.controller.js";
import { CaptchaService } from "./captcha.service.js";

@Module({
	providers: [CaptchaService],
	controllers: [CaptchaController],
	exports: [CaptchaService],
})
export class CaptchaModule {}

import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { CaptchaController } from "./captcha.controller.js";
import { CaptchaGuard } from "./captcha.guard.js";
import { CaptchaService } from "./captcha.service.js";

@Module({
	providers: [
		{
			provide: APP_GUARD,
			useClass: CaptchaGuard,
		},
		CaptchaService,
	],
	controllers: [CaptchaController],
	exports: [CaptchaService],
})
export class CaptchaModule {}

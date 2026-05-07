import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";

import { CaptchaMiddleware } from "../captcha/captcha.middleware.js";
import { CaptchaModule } from "../captcha/captcha.module.js";
import { type ConfigData } from "../config.data.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { SessionService } from "./session/session.service.js";
import { UserController } from "./user/user.controller.js";
import { UserService } from "./user/user.service.js";

@Module({
	imports: [
		JwtModule.registerAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService<ConfigData>) => {
				const jwtSecret = configService.getOrThrow("JWT_SECRET", { infer: true });
				return {
					global: true,
					secret: jwtSecret,
					signOptions: {
						expiresIn: configService.getOrThrow("ACCESS_TOKEN_DURATION", {
							infer: true,
						}),
					},
				};
			},
		}),
		CaptchaModule,
	],
	providers: [
		{
			provide: APP_GUARD,
			useClass: AuthGuard,
		},
		UserService,
		SessionService,
	],
	controllers: [AuthController, UserController],
})
export class AuthModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(CaptchaMiddleware).forRoutes("/auth/login", {
			path: "/user",
			method: RequestMethod.POST,
		});
	}
}

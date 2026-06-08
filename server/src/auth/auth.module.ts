import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import type { Request } from "express";

import { CaptchaMiddleware } from "../captcha/captcha.middleware.js";
import { CaptchaModule } from "../captcha/captcha.module.js";
import { type ConfigData } from "../config.data.js";
import { QueueModule } from "../queue/queue.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { MailService } from "./mail/mail.service.js";
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
		QueueModule,
		// Default rates are configured for an average of 3 requests per second
		ThrottlerModule.forRoot([
			{
				name: "default",
				limit: 2700,
				ttl: 15 * 60 * 1000, // 15min
			},
			{
				name: "user",
				limit: 900,
				ttl: 5 * 60 * 1000, // 5min
				getTracker(_, context): Promise<string> {
					const request = context.switchToHttp().getRequest<Request>();
					return Promise.resolve(request.accessTokenPayload?.user.id || "anonymous");
				},
			},
			{
				name: "email",
				limit: Infinity,
				ttl: 1000, // 1s
				skipIf: (context) => {
					const request = context.switchToHttp().getRequest<Request>();
					return !request.body || !("email" in request.body);
				},
				getTracker(_, context): Promise<string> {
					const request = context.switchToHttp().getRequest<Request>();
					const requestBody = request.body as unknown;

					if (
						requestBody &&
						typeof requestBody === "object" &&
						typeof requestBody["email"] === "string"
					) {
						return Promise.resolve(requestBody["email"]);
					}

					return Promise.resolve("anonymous");
				},
			},
		]),
	],
	providers: [
		{
			provide: APP_GUARD,
			useClass: AuthGuard,
		},
		MailService,
		{
			provide: APP_GUARD,
			useClass: ThrottlerGuard,
		},
		UserService,
		SessionService,
	],
	controllers: [AuthController, UserController],
})
export class AuthModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(CaptchaMiddleware).forRoutes(
			"/auth/login",
			{
				path: "/user",
				method: RequestMethod.POST,
			},
			{
				path: "/user/:id",
				method: RequestMethod.PATCH,
			},
			{
				path: "/user/:id/resend-verification-email",
				method: RequestMethod.POST,
			},
			"/user/recover-password",
		);
	}
}

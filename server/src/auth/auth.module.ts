import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { type ThrottlerOptions } from "@nestjs/throttler";
import type { Request } from "express";

import { CaptchaModule } from "../captcha/captcha.module.js";
import { ParseCaptchaMiddleware } from "../captcha/parse-captcha.middleware.js";
import { type ConfigData } from "../config.data.js";
import { QueueModule } from "../queue/queue.module.js";
import { THROTTLER_OPTIONS_PROVIDER } from "../throttler-options.provider.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { MailService } from "./mail/mail.service.js";
import { ParseJwtMiddleware } from "./parse-jwt.middleware.js";
import { SessionService } from "./session/session.service.js";
import { UserController } from "./user/user.controller.js";
import { UserService } from "./user/user.service.js";

// Default rates are configured for an average of 3 requests per second
const authThrottlerOptions: ThrottlerOptions[] = <const>[
	{
		name: "user",
		limit: 900,
		ttl: 5 * 60 * 1000, // 5min
		skipIf: (context) => {
			const request = context.switchToHttp().getRequest<Request>();
			return !request.accessTokenPayload;
		},
		getTracker(_, context): Promise<string> {
			const request = context.switchToHttp().getRequest<Request>();
			let tracker = request.accessTokenPayload?.user.id;
			if (tracker === undefined) {
				throw new Error("Couldn't determine userId for throttler tracker", {
					cause: request.accessTokenPayload,
				});
			}
			tracker = `user:${tracker}`;
			return Promise.resolve(tracker);
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

			let tracker: string | undefined;
			if (
				requestBody &&
				typeof requestBody === "object" &&
				typeof requestBody["email"] === "string"
			) {
				tracker = requestBody["email"];
			}

			if (tracker === undefined) {
				throw new Error("Couldn't determine email for throttler tracker", {
					cause: requestBody,
				});
			}

			tracker = `email:${tracker}`;
			return Promise.resolve(tracker);
		},
	},
];

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
	],
	providers: [
		{
			provide: APP_GUARD,
			useClass: AuthGuard,
		},
		MailService,
		{
			provide: THROTTLER_OPTIONS_PROVIDER,
			useValue: authThrottlerOptions satisfies ThrottlerOptions[],
		},
		UserService,
		SessionService,
	],
	controllers: [AuthController, UserController],
	exports: [THROTTLER_OPTIONS_PROVIDER],
})
export class AuthModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(ParseJwtMiddleware).forRoutes("*");
		consumer.apply(ParseCaptchaMiddleware).forRoutes("*");
	}
}

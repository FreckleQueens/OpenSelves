import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { CaptchaMiddleware } from "../captcha/captcha.middleware.js";
import { CaptchaModule } from "../captcha/captcha.module.js";
import { type ConfigData } from "../config.data.js";
import { QueueModule } from "../queue/queue.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { MailService } from "./mail/mail.service.js";
import { AccessTokenPayload } from "./session/data/access-token-payload.data.js";
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
				getTracker(request: Record<string, unknown>): Promise<string> {
					let userId: string | undefined = undefined;
					if (request && typeof request === "object" && "accessTokenPayload" in request) {
						userId = (request.accessTokenPayload as AccessTokenPayload)?.user?.id;
					}
					const tracker = userId || "anonymous";
					return Promise.resolve(tracker);
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
				path: "/user/:id/resend-verification-email",
				method: RequestMethod.POST,
			},
		);
	}
}

import { CacheModule } from "@nestjs/cache-manager";
import {
	type MiddlewareConsumer,
	Module,
	type NestModule,
	RequestMethod,
	ValidationPipe,
} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import cookieParser from "cookie-parser";
import { json } from "express";
import type { Server } from "node:http";
import { API_VERSION } from "openselves-common";

import { AuthModule } from "./auth/auth.module.js";
import { CaptchaModule } from "./captcha/captcha.module.js";
import { type ConfigData, validationSchema } from "./config.data.js";
import { DbModule } from "./db/db.module.js";
import { RobotsController } from "./robots.controller.js";
import { StatusController } from "./status.controller.js";
import { SyncModule } from "./sync/sync.module.js";
import { VersionMiddleware } from "./version.middleware.js";

@Module({
	imports: [
		AuthModule,
		CaptchaModule,
		ConfigModule.forRoot({
			isGlobal: true,
			cache: true,
			validationSchema: validationSchema,
		}),
		CacheModule.register({
			isGlobal: true,
		}),
		DbModule,
		ScheduleModule.forRoot(),
		SyncModule,
		// Default rates are configured for an average of 3 requests per second
		ThrottlerModule.forRoot([
			{
				name: "default",
				limit: 2700,
				ttl: 15 * 60 * 1000, // 15min
			},
		]),
	],
	controllers: [RobotsController, StatusController],
	providers: [
		{
			provide: APP_GUARD,
			useClass: ThrottlerGuard,
		},
		VersionMiddleware,
	],
})
export class AppModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(VersionMiddleware)
			.exclude("/robots.txt")
			.exclude("/attachment/*path")
			.exclude({
				path: "/captcha/challenge{/*path}",
				method: RequestMethod.GET,
			})
			.forRoutes("*");
	}
}

export function configureApp(app: NestExpressApplication<Server>) {
	const configService = app.get(ConfigService<ConfigData>);
	configService.set("_APP_VERSION", API_VERSION);

	app.set("trust proxy", "loopback");
	app.use(json({ limit: configService.getOrThrow("MAX_UPLOAD_SIZE", { infer: true }) * 2 }));
	app.useGlobalPipes(
		new ValidationPipe({
			transform: true,
			transformOptions: {
				enableImplicitConversion: true,
			},
			whitelist: true,
			validateCustomDecorators: true,
		}),
	);
	app.enableCors({
		origin: configService.getOrThrow("ALLOWED_ORIGINS", { infer: true }),
		credentials: true,
	});
	app.use(cookieParser());
}

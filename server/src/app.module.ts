import {
	type INestApplication,
	type MiddlewareConsumer,
	Module,
	type NestModule,
	RequestMethod,
	ValidationPipe,
} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import { API_VERSION } from "openselves-common";

import { AuthModule } from "./auth/auth.module.js";
import { CaptchaModule } from "./captcha/captcha.module.js";
import { type ConfigData, validationSchema } from "./config.data.js";
import { DbModule } from "./db/db.module.js";
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
		DbModule,
		SyncModule,
	],
	controllers: [StatusController],
	providers: [VersionMiddleware],
})
export class AppModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(VersionMiddleware)
			.exclude("/attachment/*path")
			.exclude({
				path: "/captcha/challenge",
				method: RequestMethod.GET,
			})
			.forRoutes("*");
	}
}

export function configureApp(app: INestApplication) {
	const configService = app.get(ConfigService<ConfigData>);

	configService.set("_APP_VERSION", API_VERSION);

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

import {
	type INestApplication,
	type MiddlewareConsumer,
	Module,
	type NestModule,
	ValidationPipe,
} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";

import rootPackage from "../../package.json" with { type: "json" };
import { AuthModule } from "./auth/auth.module.js";
import { type ConfigData, validationSchema } from "./config.data.js";
import { DbModule } from "./db/db.module.js";
import { StatusController } from "./status.controller.js";
import { SyncModule } from "./sync/sync.module.js";
import { VersionMiddleware } from "./version.middleware.js";

@Module({
	imports: [
		AuthModule,
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
		consumer.apply(VersionMiddleware).forRoutes("*");
	}
}

export function configureApp(app: INestApplication) {
	const configService = app.get(ConfigService<ConfigData>);

	configService.set("_APP_VERSION", rootPackage.version);

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

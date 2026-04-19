import { type INestApplication, Module, ValidationPipe } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";

import { AuthModule } from "./auth/auth.module.js";
import { type ConfigData, validationSchema } from "./config.data.js";
import { DbModule } from "./db/db.module.js";
import { StatusController } from "./status.controller.js";
import { SyncModule } from "./sync/sync.module.js";

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
})
export class AppModule {}

export function configureApp(app: INestApplication) {
	const configService = app.get(ConfigService<ConfigData>);
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

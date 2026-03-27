import { type INestApplication, Module, ValidationPipe } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";

import { AuthModule } from "./auth/auth.module.js";
import { DbModule } from "./auth/db/db.module.js";
import { type ConfigData, validationSchema } from "./config.data.js";

@Module({
	imports: [
		AuthModule,
		ConfigModule.forRoot({
			isGlobal: true,
			cache: true,
			validationSchema: validationSchema,
		}),
		DbModule,
	],
})
export class AppModule {}

export function configureApp(app: INestApplication) {
	const configService = app.get(ConfigService<ConfigData>);
	app.useGlobalPipes(
		new ValidationPipe({
			transform: true,
		}),
	);
	app.enableCors({
		origin: configService.getOrThrow("ALLOWED_ORIGINS", { infer: true }),
		credentials: true,
	});
	app.use(cookieParser());
}

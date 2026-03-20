import { INestApplication, Module, ValidationPipe } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";

import { AuthModule } from "./auth/auth.module";
import { ConfigData, validationSchema } from "./config.data";

@Module({
	imports: [
		AuthModule,
		ConfigModule.forRoot({
			isGlobal: true,
			cache: true,
			validationSchema: validationSchema,
		}),
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

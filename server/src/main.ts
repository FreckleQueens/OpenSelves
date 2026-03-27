import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { AppModule, configureApp } from "./app.module.js";
import { type ConfigData } from "./config.data.js";

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	configureApp(app);
	const configService = app.get(ConfigService<ConfigData>);
	await app.listen(configService.get("LISTEN_PORT", 3000, { infer: true }));
}
bootstrap().catch((error) => {
	console.error(error);
});

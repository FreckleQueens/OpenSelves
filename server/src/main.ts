import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import rootPackage from "../../package.json" with { type: "json" };
import { AppModule, configureApp } from "./app.module.js";
import { type ConfigData } from "./config.data.js";

async function bootstrap() {
	const logger = new Logger("bootstrap");
	logger.log(`OpenSelves API version ${rootPackage.version}`);

	const app = await NestFactory.create(AppModule, {
		logger: logger,
	});
	configureApp(app);
	const configService = app.get(ConfigService<ConfigData>);
	await app.listen(configService.get("LISTEN_PORT", 3000, { infer: true }));
}
bootstrap().catch((error) => {
	console.error(error);
});

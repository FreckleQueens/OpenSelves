import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { API_VERSION } from "openselves-common";

import { AppModule, configureApp } from "./app.module.js";
import { handleCli } from "./cli.js";
import { type ConfigData } from "./config.data.js";

async function bootstrap() {
	const logger = new Logger("bootstrap");
	logger.log(`OpenSelves API version ${API_VERSION}`);

	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		logger: logger,
	});
	configureApp(app);

	if (await handleCli(app)) {
		return;
	}

	const configService = app.get(ConfigService<ConfigData>);
	const listenPort = configService.get("LISTEN_PORT", 3000, { infer: true });
	await app.listen(listenPort);
}
bootstrap().catch((error) => {
	console.error(error);
});

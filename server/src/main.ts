import { Logger, type NestApplicationOptions } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { readFileSync } from "node:fs";
import { API_VERSION } from "openselves-common";

import { AppModule, configureApp } from "./app.module.js";
import { handleCli } from "./cli.js";
import { type ConfigData } from "./config.data.js";

async function bootstrap() {
	const logger = new Logger("bootstrap");
	logger.log(`OpenSelves API version ${API_VERSION}`);

	const options: NestApplicationOptions = {
		logger,
	};

	if (process.env.INSECURE_ENABLE_DEV_HTTPS === "true") {
		options.httpsOptions = {
			key: readFileSync("./.dev/server.key"),
			cert: readFileSync("./.dev/server.cert"),
		};
	}

	const app = await NestFactory.create<NestExpressApplication>(AppModule, options);
	configureApp(app);

	if (await handleCli(app)) {
		return;
	}

	const configService = app.get(ConfigService<ConfigData>);
	const listenScheme = options.httpsOptions ? "https" : "http";
	const listenHost = configService.get("LISTEN_HOST", "localhost", { infer: true });
	const listenPort = configService.get("LISTEN_PORT", 3000, { infer: true });
	logger.log(`Listening on ${listenScheme}://${listenHost}:${listenPort}...`);
	await app.listen(listenPort, listenHost);
}
bootstrap().catch((error) => {
	console.error(error);
});

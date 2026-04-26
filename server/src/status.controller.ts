import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Public } from "./auth/decorators/public.decorator.js";
import type { ConfigData } from "./config.data.js";

@Controller("status")
export class StatusController {
	constructor(private readonly configService: ConfigService<ConfigData>) {}

	@Public()
	@Get("")
	public status() {
		return {
			ready: true,
			version: this.configService.getOrThrow("_APP_VERSION", {
				infer: true,
			}),
		};
	}
}

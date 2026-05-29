import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { GetStatusResult } from "openselves-common";

import { Public } from "./auth/decorators/public.decorator.js";
import type { ConfigData } from "./config.data.js";

@Controller("status")
export class StatusController {
	constructor(private readonly configService: ConfigService<ConfigData>) {}

	@Public()
	@Get("")
	public status(): GetStatusResult {
		return {
			ready: true,
			version: this.configService.getOrThrow("_APP_VERSION", {
				infer: true,
			}),
			maxUploadSize: this.configService.getOrThrow("MAX_UPLOAD_SIZE", { infer: true }),
			areRegistrationsOpen: !this.configService.get("REGISTRATION_PASSWORD", { infer: true }),
			unverifiedAccountCullingDelay: this.configService.getOrThrow(
				"UNVERIFIED_ACCOUNT_CULLING_DELAY",
				{ infer: true },
			),
		};
	}
}

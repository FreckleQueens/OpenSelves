import { Injectable, type NestMiddleware, NotAcceptableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NextFunction, Request, Response } from "express";

import type { ConfigData } from "./config.data.js";

@Injectable()
export class VersionMiddleware implements NestMiddleware {
	constructor(private readonly configService: ConfigService<ConfigData>) {}

	use(req: Request, res: Response, next: NextFunction) {
		const version = this.configService.getOrThrow("_APP_VERSION", { infer: true });
		res.setHeader("X-OpenSelves-Version", version);
		res.setHeader("Access-Control-Expose-Headers", "X-OpenSelves-Version");
		if (req.headers["x-openselves-version"] !== version) {
			throw new NotAcceptableException({
				expectedVersion: version,
			});
		}
		next();
	}
}

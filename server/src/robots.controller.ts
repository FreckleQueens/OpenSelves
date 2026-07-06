import { Controller, Get, Injectable, Res } from "@nestjs/common";
import type { Response } from "express";

import { Public } from "./auth/decorators/public.decorator.js";

@Injectable()
@Controller()
export class RobotsController {
	@Get("robots.txt")
	@Public()
	public getRobotsTxt(@Res() response: Response) {
		response.type("text");
		return response.send(["user-agent: *", "disallow: /", ""].join("\n"));
	}
}

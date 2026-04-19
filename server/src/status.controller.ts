import { Controller, Get } from "@nestjs/common";

import { Public } from "./auth/decorators/public.decorator.js";

@Controller("status")
export class StatusController {
	@Public()
	@Get("")
	public status() {
		return {
			ready: true,
		};
	}
}

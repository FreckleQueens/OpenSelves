import type { Challenge, Solution } from "altcha-lib";

import type { ActiveCaptchaFactorWithCurrentCount } from "../captcha.service.js";

declare global {
	namespace Express {
		export interface Request {
			captchaPayload: { challenge: Challenge; solution: Solution };
			activeFactors: ActiveCaptchaFactorWithCurrentCount[];
			sendEmailActionEmail?: string;
		}
	}
}

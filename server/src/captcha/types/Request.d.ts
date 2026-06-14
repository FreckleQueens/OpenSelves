import type { ActiveCaptchaFactorWithCurrentCount } from "../captcha.service.js";

declare global {
	namespace Express {
		export interface Request {
			activeFactors: ActiveCaptchaFactorWithCurrentCount[];
			sendEmailActionEmail?: string;
		}
	}
}

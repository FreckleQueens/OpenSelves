import { Reflector } from "@nestjs/core";

export class CaptchaSettings {}

/**
 * Allow unauthenticated users.
 */
export const Captcha = Reflector.createDecorator<CaptchaSettings | undefined>({
	transform: (value): CaptchaSettings => {
		return value
			? {
					...value,
				}
			: {};
	},
});

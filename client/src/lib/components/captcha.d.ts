export type CaptchaController = {
	verify(): void;
	onSolved(resolve: (value: string | undefined) => void): void;
};

export type CaptchaAction = "sendEmail";

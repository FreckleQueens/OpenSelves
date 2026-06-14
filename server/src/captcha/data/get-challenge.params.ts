import { IsAlphanumeric, IsEmail, IsOptional, IsString } from "class-validator";

export class GetChallengeParams {
	@IsString()
	@IsAlphanumeric()
	@IsOptional()
	public readonly action?: string;

	@IsString()
	@IsEmail(undefined, {
		validateIf(object: unknown) {
			return !!(object && typeof object === "object" && object["action"] === "sendEmail");
		},
	})
	@IsOptional()
	public readonly actionValue?: string;
}

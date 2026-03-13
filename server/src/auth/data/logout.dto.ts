import { IsString, MinLength } from "class-validator";

export class LogoutDto {
	@IsString()
	@MinLength(1)
	public readonly refreshToken: string;
}

import { IsAlphanumeric, IsString, Length, MinLength } from "class-validator";

export class RecoverPasswordDto {
	@IsString()
	@IsAlphanumeric()
	@Length(64)
	public readonly token!: string;

	@MinLength(8)
	public readonly newPassword!: string;
}

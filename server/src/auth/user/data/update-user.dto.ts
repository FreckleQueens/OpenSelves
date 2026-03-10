import { IsEmail, IsNotEmpty, IsOptional, MinLength, ValidateIf } from "class-validator";

export class UpdateUserDto {
	@IsOptional()
	@IsEmail()
	public readonly email?: string;

	@ValidateIf((object: UpdateUserDto) => typeof object.newPassword === "string")
	@IsNotEmpty()
	public readonly oldPassword?: string;

	@ValidateIf((object: UpdateUserDto) => typeof object.oldPassword === "string")
	@MinLength(8)
	public readonly newPassword?: string;
}

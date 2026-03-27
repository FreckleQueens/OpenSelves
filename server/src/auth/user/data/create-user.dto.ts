import { IsEmail, IsOptional, MinLength } from "class-validator";

export class CreateUserDto {
	@IsEmail()
	public readonly email!: string;

	@MinLength(8)
	public readonly password!: string;

	@IsOptional()
	@MinLength(8)
	public readonly registrationPassword!: string;
}

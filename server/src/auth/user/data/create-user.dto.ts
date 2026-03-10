import { IsEmail, MinLength } from "class-validator";

export class CreateUserDto {
	@IsEmail()
	public readonly email: string;

	@MinLength(8)
	public readonly password: string;
}

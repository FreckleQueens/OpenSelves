import { IsEmail, MinLength } from "class-validator";

export class LoginDto {
	@IsEmail()
	public readonly email!: string;

	@MinLength(8)
	public readonly password!: string;
}

import { IsBoolean, IsEmail, IsOptional, MinLength } from "class-validator";

export class LoginDto {
	@IsEmail()
	public readonly email!: string;

	@MinLength(8)
	public readonly password!: string;

	@IsBoolean()
	@IsOptional()
	public readonly persistSession?: boolean;
}

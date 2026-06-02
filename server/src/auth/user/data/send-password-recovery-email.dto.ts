import { IsEmail } from "class-validator";

export class SendPasswordRecoveryEmailDto {
	@IsEmail()
	public readonly email!: string;
}

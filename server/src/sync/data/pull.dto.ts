import { IsString } from "class-validator";

export class PullDto {
	@IsString()
	public readonly timestamp!: string;
}

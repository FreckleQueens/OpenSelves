import { IsNumber, ValidateIf } from "class-validator";

export class PullDto {
	@IsNumber()
	@ValidateIf((obj, val) => val !== "init")
	public readonly timestamp!: number | "init";
}

import { Type } from "class-transformer";
import { IsInt } from "class-validator";

export class FindOneParams {
	@Type(() => Number)
	@IsInt()
	public readonly id: number;
}

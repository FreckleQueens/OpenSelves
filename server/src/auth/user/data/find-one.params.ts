import { MinLength } from "class-validator";

export class FindOneParams {
	@MinLength(1)
	public readonly id!: string;
}

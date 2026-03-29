import { Type } from "class-transformer";
import {
	ArrayMinSize,
	IsArray,
	IsBoolean,
	IsDate,
	IsIn,
	IsString,
	ValidateIf,
	ValidateNested,
} from "class-validator";
import type { Log, Member } from "openselves-common/db";

import { IsCuid2 } from "./is-cuid2.decorator.js";

export class PushMemberDto implements Member {
	@IsCuid2()
	public readonly id!: string;

	@IsCuid2()
	public readonly userId!: string;

	@IsString()
	public readonly name!: string;

	@IsString()
	public readonly pronouns!: string;

	@IsString()
	public readonly description!: string;

	@IsBoolean()
	public readonly isArchived!: boolean;

	@IsString()
	@ValidateIf((object, value) => value !== null)
	public readonly archivedReason!: string | null;

	@IsDate()
	public readonly createdAt!: Date;

	@IsDate()
	public readonly updatedAt!: Date;
}

export class PushLogDto implements Omit<Log, "pushedAt"> {
	@IsCuid2()
	public readonly id!: string;

	@IsCuid2()
	public readonly memberId!: string;

	@IsIn(["create", "update", "delete"])
	public readonly operationType!: "create" | "update" | "delete";

	@ValidateNested()
	public readonly data!: PushMemberDto;

	@IsDate()
	public readonly executedAt!: Date;

	@IsIn([undefined])
	readonly pushedAt!: undefined;
}

export class PushDto {
	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => PushLogDto)
	public readonly logs!: PushLogDto[];
}

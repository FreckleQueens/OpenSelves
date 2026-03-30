import { Type } from "class-transformer";
import {
	ArrayMinSize,
	IsArray,
	IsBoolean,
	IsDate,
	IsIn,
	IsOptional,
	IsString,
	ValidateIf,
	ValidateNested,
} from "class-validator";
import type { Log, Member } from "openselves-common/db";

import { IsCuid2 } from "./is-cuid2.decorator.js";

type OmitBaseFields<K> = Omit<K, "id" | "userId" | "createdAt" | "updatedAt">;

class PushRecordDto {
	@IsIn([undefined])
	public readonly id!: undefined;

	@IsIn([undefined])
	public readonly userId!: undefined;

	@IsIn([undefined])
	public readonly createdAt!: undefined;

	@IsIn([undefined])
	public readonly updatedAt!: undefined;
}

export class PushCreateMemberDto extends PushRecordDto implements OmitBaseFields<Member> {
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
}

export class PushUpdateMemberDto extends PushRecordDto implements Partial<OmitBaseFields<Member>> {
	@IsOptional()
	@IsString()
	public readonly name?: string;

	@IsOptional()
	@IsString()
	public readonly pronouns?: string;

	@IsOptional()
	@IsString()
	public readonly description?: string;

	@IsOptional()
	@IsBoolean()
	public readonly isArchived?: boolean;

	@IsOptional()
	@IsString()
	@ValidateIf((object, value) => value !== null)
	public readonly archivedReason?: string | null;
}

export type CreateOperation = {
	type: "create";
	data: PushCreateMemberDto;
	memberId: string;
	deletedId: null;
};
export type UpdateOperation = {
	type: "update";
	data: PushUpdateMemberDto;
	memberId: string;
	deletedId: null;
};
export type DeleteOperation = {
	type: "delete";
	data: undefined;
	memberId: null;
	deletedId: string;
};
export type OperationType = CreateOperation | UpdateOperation | DeleteOperation;

export class PushLogDto<Op extends OperationType = OperationType> implements Omit<
	Log,
	"userId" | "pushedAt" | "deletedId" | "data"
> {
	@IsCuid2()
	public readonly id!: string;

	@IsCuid2()
	public readonly memberId!: Op["memberId"];

	@IsIn(["create", "update", "delete"])
	public readonly operationType!: Op["type"];

	@ValidateIf((object) => {
		const obj = object as unknown;
		return !!(
			obj &&
			typeof obj === "object" &&
			"operationType" in obj &&
			obj.operationType !== "delete"
		);
	})
	@ValidateNested()
	@Type((helper) => {
		switch (helper?.object.operationType) {
			case "create":
				return PushCreateMemberDto;
			case "update":
				return PushUpdateMemberDto;
			case "delete":
			default:
				return Object;
		}
	})
	public readonly data!: Op["data"];

	@IsDate()
	public readonly executedAt!: Date;

	@IsIn([undefined])
	public readonly pushedAt!: undefined;
}

export class PushDto {
	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => PushLogDto)
	public readonly logs!: PushLogDto[];
}

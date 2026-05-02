import type {
	ArgumentMetadata,
	PipeTransform,
} from "@nestjs/common/interfaces/features/pipe-transform.interface.js";
import { Type } from "class-transformer";
import {
	ArrayMinSize,
	IsArray,
	IsBoolean,
	IsDataURI,
	IsDate,
	IsHexColor,
	IsIn,
	IsNumber,
	IsOptional,
	IsString,
	IsUrl,
	MaxLength,
	ValidateIf,
	ValidateNested,
} from "class-validator";
import type {
	FrontCreate,
	FrontUpdate,
	Log,
	MemberCreate,
	MemberUpdate,
} from "openselves-common/db";

import { IsCuid2 } from "./is-cuid2.decorator.js";

type OmitBaseFields<K> = Omit<K, "id" | "userId">;

class PushRecordDto {
	@IsIn([undefined])
	public readonly id!: undefined;

	@IsIn([undefined])
	public readonly userId!: undefined;
}

export class PushUpdateMemberDto extends PushRecordDto implements OmitBaseFields<MemberUpdate> {
	@IsString()
	@IsNumber()
	@IsIn([undefined])
	@ValidateIf((object) => {
		const obj = object as unknown;
		if (!obj || typeof obj !== "object") return true;
		return ![
			"name",
			"pronouns",
			"description",
			"color",
			"image",
			"isArchived",
			"archivedReason",
			"createdAt",
			"updatedAt",
		].find((field) => {
			return typeof obj[field] !== "undefined";
		});
	})
	public readonly _atLeastOneFieldIsRequired!: undefined;

	@IsOptional()
	@IsString()
	public readonly name?: string;

	@IsOptional()
	@IsString()
	public readonly pronouns?: string;

	@IsOptional()
	@IsString()
	public readonly description?: string;

	@IsString()
	@IsHexColor()
	@ValidateIf((object, value) => value !== undefined && value !== null)
	public readonly color?: string | null;

	@IsOptional()
	@IsString()
	@MaxLength(8 * 1024) // 8kB
	@IsUrl(
		{
			allow_fragments: false,
			validate_length: false,
		},
		{
			validateIf(object, value) {
				return typeof value === "string" && !value.startsWith("data:");
			},
		},
	)
	@IsDataURI({
		validateIf(object, value) {
			return typeof value === "string" && value.startsWith("data:");
		},
	})
	@ValidateIf(
		(object, value) =>
			value !== null && !(typeof value === "string" && value.startsWith("attachment:")),
	)
	public readonly image?: string | null;

	@IsOptional()
	@IsBoolean()
	public readonly isArchived?: boolean;

	@IsOptional()
	@IsString()
	@ValidateIf((object, value) => value !== null)
	public readonly archivedReason?: string | null;

	@IsOptional()
	@IsDate()
	public readonly createdAt?: Date;

	@IsOptional()
	@IsDate()
	public readonly updatedAt?: Date;
}

export class PushCreateMemberDto
	extends PushUpdateMemberDto
	implements OmitBaseFields<MemberCreate>
{
	@IsString()
	declare public readonly name: string;

	@IsString()
	declare public readonly pronouns: string;

	@IsString()
	declare public readonly description: string;

	@IsDate()
	declare public readonly createdAt: Date;

	@IsDate()
	declare public readonly updatedAt: Date;
}

export class PushUpdateFrontDto extends PushRecordDto implements OmitBaseFields<FrontUpdate> {
	@IsString()
	@IsNumber()
	@IsIn([undefined])
	@ValidateIf((object) => {
		const obj = object as unknown;
		if (!obj || typeof obj !== "object") return true;
		return !["memberId", "startedAt", "endedAt", "note", "createdAt", "updatedAt"].find(
			(field) => {
				return typeof obj[field] !== "undefined";
			},
		);
	})
	public readonly _atLeastOneFieldIsRequired!: undefined;

	@IsOptional()
	@IsCuid2()
	public readonly memberId?: string;

	@IsOptional()
	@IsDate()
	public readonly startedAt?: Date;

	@IsOptional()
	@IsDate()
	@Type(() => Date)
	@ValidateIf((object, value) => value !== null)
	public readonly endedAt?: Date | null;

	@IsOptional()
	@IsString()
	@ValidateIf((object, value) => value !== null)
	public readonly note?: string | null;

	@IsOptional()
	@IsDate()
	public readonly createdAt?: Date;

	@IsOptional()
	@IsDate()
	public readonly updatedAt?: Date;
}

export class PushCreateFrontDto extends PushUpdateFrontDto implements OmitBaseFields<FrontCreate> {
	@IsCuid2()
	declare public readonly memberId: string;

	@IsDate()
	declare public readonly startedAt: Date;

	@IsDate()
	declare public readonly createdAt: Date;

	@IsDate()
	declare public readonly updatedAt: Date;
}

export type CreateOperation = {
	type: "create";
	data: PushCreateMemberDto | PushCreateFrontDto;
	recordId: string | null;
	deletedId: null;
};
export type UpdateOperation = {
	type: "update";
	data: PushUpdateMemberDto | PushUpdateFrontDto;
	recordId: string | null;
	deletedId: null;
};
export type DeleteOperation = {
	type: "delete";
	data: undefined;
	recordId: null;
	deletedId: string;
};
export type OperationType = CreateOperation | UpdateOperation | DeleteOperation;

type ClientPushLog = Omit<
	Log,
	"userId" | "pushedAt" | "deletedId" | "data" | "memberId" | "frontId"
> & {
	memberId?: string;
	frontId?: string;
};

export class PushLogDto<Op extends OperationType = OperationType> implements ClientPushLog {
	@IsString()
	@IsNumber()
	@IsIn([undefined])
	@ValidateIf((object) => {
		const obj = object as unknown;
		if (!obj || typeof obj !== "object") return true;
		return (
			["memberId", "frontId"].filter((field) => {
				return typeof obj[field] !== "undefined";
			}).length !== 1
		);
	})
	public readonly _exactlyOneRecordIdIsRequired!: undefined;

	@IsCuid2()
	public readonly id!: string;

	@IsOptional()
	@IsCuid2()
	public readonly memberId?: string;

	@IsOptional()
	@IsCuid2()
	public readonly frontId?: string;

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
		const types = {
			member: [PushCreateMemberDto, PushUpdateMemberDto],
			front: [PushCreateFrontDto, PushUpdateFrontDto],
		};
		let model: keyof typeof types | null = null;
		if (helper?.object.memberId) {
			model = "member";
		}
		if (helper?.object.frontId) {
			model = "front";
		}
		if (model === null) {
			return Object;
		}
		switch (helper?.object.operationType) {
			case "create":
				return types[model][0];
			case "update":
				return types[model][1];
			case "delete":
			default:
				return Object;
		}
	})
	public readonly data!: Op["data"];

	@IsDate()
	public readonly executedAt!: Date;

	@IsIn([undefined])
	public readonly deletedId!: undefined;

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

export class PushDtoTransformPipe implements PipeTransform<unknown, unknown> {
	transform(value: unknown, metadata: ArgumentMetadata): unknown {
		const output = value;
		if (metadata.metatype === PushDto) {
			if (output && typeof output === "object" && typeof output["logs"] === "string") {
				output["logs"] = JSON.parse(output["logs"]) as unknown;
			}
		}
		return value;
	}
}

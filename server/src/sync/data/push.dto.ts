import type {
	ArgumentMetadata,
	PipeTransform,
} from "@nestjs/common/interfaces/features/pipe-transform.interface.js";
import { Type } from "class-transformer";
import {
	ArrayMinSize,
	IsArray,
	IsIn,
	IsString,
	Matches,
	MaxLength,
	ValidateNested,
} from "class-validator";
import { MAX_PATH_LENGTH, OPENSELVES_NAMESPACE_ID } from "openselves-common/willow";

import { IsPayloadDigest } from "./is-payload-digest.decorator.js";
import { IsPayloadLength } from "./is-payload-length.decorator.js";
import { IsPresentJ2000Timestamp } from "./is-present-j2000-timestamp.decorator.js";
import { IsUint64 } from "./is-uint64.decorator.js";

export class PushEntryDto {
	@IsIn([OPENSELVES_NAMESPACE_ID])
	public readonly namespaceId!: string;

	@IsString()
	public readonly subspaceId!: string;

	@IsString()
	@MaxLength(MAX_PATH_LENGTH)
	@Matches(/^(\/[^/]+)+$/g)
	public readonly path!: string;

	@IsUint64()
	@IsPresentJ2000Timestamp({
		validateIf(obj: unknown) {
			return !(obj && typeof obj === "object" && "payload" in obj && obj["payload"] === "");
		},
	})
	public readonly timestamp!: bigint;

	@IsUint64()
	@IsPayloadLength({
		validateIf(obj: unknown) {
			return !!(
				obj &&
				typeof obj === "object" &&
				"payload" in obj &&
				typeof obj.payload === "string"
			);
		},
	})
	public readonly payloadLength!: bigint;

	@IsString()
	@IsPayloadDigest({
		validateIf(obj: unknown) {
			return !!(
				obj &&
				typeof obj === "object" &&
				"payload" in obj &&
				typeof obj.payload === "string"
			);
		},
	})
	public readonly payloadDigest!: string;

	@IsString()
	public readonly payload!: string;
}

export class PushDto {
	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => PushEntryDto)
	public readonly entries!: PushEntryDto[];
}

export class PushDtoTransformPipe implements PipeTransform<unknown, unknown> {
	transform(value: unknown, metadata: ArgumentMetadata): unknown {
		const output = value;
		if (metadata.metatype === PushDto) {
			if (output && typeof output === "object" && typeof output["entries"] === "string") {
				output["entries"] = JSON.parse(output["entries"]) as unknown;
			}
		}
		return value;
	}
}

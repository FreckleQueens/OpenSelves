import type { Config } from "@jest/types";
import { ESM_TS_TRANSFORM_PATTERN, TS_EXT_TO_TREAT_AS_ESM } from "ts-jest";

export default {
	extensionsToTreatAsEsm: [...TS_EXT_TO_TREAT_AS_ESM],
	transform: {
		[ESM_TS_TRANSFORM_PATTERN]: [
			"ts-jest",
			{
				useESM: true,
			},
		],
	},
	moduleNameMapper: {
		"^(\\..+)\\.js": "$1",
	},
	testMatch: ["<rootDir>/test/**/*.e2e-spec.ts"],
} satisfies Config.InitialOptions;

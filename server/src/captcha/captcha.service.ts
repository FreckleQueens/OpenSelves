import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
	type Challenge,
	type CreateChallengeOptions,
	type Solution,
	createChallenge,
	randomInt,
	verifySolution,
} from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/argon2id";

import type { ConfigData } from "../config.data.js";

const CAPTCHA_CACHE_PREFIX = "service.captcha.";

@Injectable()
export class CaptchaService {
	public static challengeTtl: number = 30 * 60; // 30 minutes

	constructor(
		private readonly configService: ConfigService<ConfigData>,
		@Inject(CACHE_MANAGER)
		private readonly cache: Cache,
	) {}

	public async createChallenge() {
		const challengeParams: CreateChallengeOptions = {
			algorithm: "ARGON2ID",
			cost: 3,
			memoryCost: 65536,
			parallelism: 1,
			counter: randomInt(200, 100),
			deriveKey,
			hmacSignatureSecret: this.configService.getOrThrow("CAPTCHA_SECRET", {
				infer: true,
			}),
			hmacKeySignatureSecret: this.configService.getOrThrow("CAPTCHA_KEY_SECRET", {
				infer: true,
			}),
			expiresAt: new Date(Date.now() + CaptchaService.challengeTtl * 1000),
		};

		if (
			this.configService.get("INSECURE_EASY_CAPTCHA_FOR_TESTS", {
				infer: true,
			})
		) {
			challengeParams.counter = 1;
			challengeParams.cost = 1;
			challengeParams.memoryCost = 32;
		}

		return await createChallenge(challengeParams);
	}

	public async verifySolution(challenge: Challenge, solution: Solution): Promise<boolean> {
		try {
			const result = await verifySolution({
				challenge,
				solution,
				deriveKey,
				hmacSignatureSecret: this.configService.getOrThrow("CAPTCHA_SECRET", {
					infer: true,
				}),
				hmacKeySignatureSecret: this.configService.getOrThrow("CAPTCHA_KEY_SECRET", {
					infer: true,
				}),
			});

			if (result.verified) {
				const challengeCacheKey = CAPTCHA_CACHE_PREFIX + JSON.stringify(challenge);

				if ((await this.cache.get(challengeCacheKey)) === true) {
					return false;
				}

				const expiresAt = challenge.parameters.expiresAt;
				if (!expiresAt) {
					return false;
				}

				await this.cache.set(challengeCacheKey, true, expiresAt * 1000 - Date.now());
			}

			return result.verified;
		} catch {
			return false;
		}
	}
}

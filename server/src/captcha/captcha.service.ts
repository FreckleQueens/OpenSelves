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
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { randomBytes } from "crypto";
import { type Request } from "express";
import ipaddr from "ipaddr.js";
import { argon2 } from "node:crypto";

import type { ConfigData } from "../config.data.js";

const CAPTCHA_CACHE_PREFIX = "service.captcha.";

export type CaptchaFactor = {
	cacheKeyPrefix: string;
	cacheKey: (request: Request, captchaService: CaptchaService) => Promise<string | undefined>;
	countMultiplier: number;
	ttlMs: number;
};
export type ActiveCaptchaFactor = Omit<CaptchaFactor, "cacheKey"> & {
	cacheKey: string;
};
export type ActiveCaptchaFactorWithCurrentCount = ActiveCaptchaFactor & {
	currentCount: number;
};
export const CAPTCHA_FACTORS: CaptchaFactor[] = [
	{
		cacheKeyPrefix: "ip.",
		cacheKey: async (request: Request, captchaService: CaptchaService) => {
			const rawIp = request.ips.length ? request.ips[0] : request.ip;
			return rawIp ? await captchaService.weakHashString(anonymiseIpAddr(rawIp)) : rawIp;
		},
		countMultiplier: 1,
		ttlMs: 2 * 60 * 1000, // 2 minutes
	},
	{
		cacheKeyPrefix: "email.",
		cacheKey: async (request: Request, captchaService: CaptchaService) => {
			const email = request.sendEmailActionEmail;
			return email ? await captchaService.weakHashString(anonymiseEmailAddr(email)) : email;
		},
		countMultiplier: 2,
		ttlMs: 15 * 60 * 1000, // 15 minutes
	},
];

@Injectable()
export class CaptchaService {
	private readonly runtimeSalt = randomBytes(128).toString("hex");

	constructor(
		private readonly configService: ConfigService<ConfigData>,
		@Inject(CACHE_MANAGER)
		private readonly cache: Cache,
	) {}

	public async createChallenge(factor: number, sendEmailActionEmail: string | undefined) {
		if (factor < 1) {
			throw new Error("factor cannot be less than 1");
		}
		if (factor > 10) {
			throw new Error("factor cannot be more than 10");
		}

		factor = Math.floor(factor);

		const challengeTtl = this.configService.getOrThrow("CAPTCHA_CHALLENGE_TTL_SECONDS", {
			infer: true,
		});

		const challengeParams: CreateChallengeOptions = {
			// TODO: argon2id algorithm crashes with multiple workers in chrome on certain android devices
			//  this can be tested on https://playground.altcha.org/#/pow
			//  see https://github.com/altcha-org/altcha/issues/192
			// algorithm: "ARGON2ID",
			// cost: 3,
			// memoryCost: 65536,
			// parallelism: 1,
			// counter: randomInt(80 * factor, 40 * factor),
			algorithm: "PBKDF2/SHA-256",
			cost: 5000,
			counter: randomInt(1000 * factor, 500 * factor),
			deriveKey,
			hmacSignatureSecret: this.configService.getOrThrow("CAPTCHA_SECRET", {
				infer: true,
			}),
			hmacKeySignatureSecret: this.configService.getOrThrow("CAPTCHA_KEY_SECRET", {
				infer: true,
			}),
			expiresAt: new Date(Date.now() + challengeTtl * 1000),
			data: {
				sendEmailActionEmail: sendEmailActionEmail || null,
			},
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
			const expiresAt = challenge.parameters.expiresAt;
			if (!expiresAt) {
				return false;
			}

			const challengeCacheKey = CAPTCHA_CACHE_PREFIX + JSON.stringify(challenge);

			if ((await this.cache.get(challengeCacheKey)) === true) {
				return false;
			}

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
				await this.cache.set(challengeCacheKey, true, expiresAt * 1000 - Date.now());
			}

			return result.verified;
		} catch {
			return false;
		}
	}

	public async increaseGenericFactorsFromRequest(request: Request): Promise<void> {
		const activeFactors = await this.getActiveFactorsFromRequest(request);

		await this.cache.mset(
			activeFactors.map((factor) => {
				return {
					key: factor.cacheKey,
					value: factor.currentCount + 1,
					ttl: factor.ttlMs,
				};
			}),
		);
	}

	public async getFactorFromRequest(request: Request): Promise<number> {
		const activeFactors = await this.getActiveFactorsFromRequest(request);
		const factor = activeFactors
			.map((factor) => {
				return factor.countMultiplier * factor.currentCount;
			})
			.reduce((previous, current) => previous + current, 1);

		return Math.min(factor, 10);
	}

	private async getActiveFactorsFromRequest(
		request: Request,
	): Promise<ActiveCaptchaFactorWithCurrentCount[]> {
		if (request.activeFactors) {
			return request.activeFactors;
		}

		const computedFactors = await Promise.all(
			CAPTCHA_FACTORS.map(async (factor) => {
				const key = await factor.cacheKey(request, this);
				return {
					...factor,
					cacheKey:
						typeof key === "string"
							? CAPTCHA_CACHE_PREFIX + "factor." + factor.cacheKeyPrefix + key
							: undefined,
				};
			}),
		);
		const activeFactors = computedFactors.filter((factor): factor is ActiveCaptchaFactor => {
			return typeof factor.cacheKey === "string";
		});

		const currentCounts = (
			await this.cache.mget(activeFactors.map((factor) => factor.cacheKey))
		).map((val) => (typeof val === "number" ? val : 0));

		const activeFactorsWithCurrentCount: ActiveCaptchaFactorWithCurrentCount[] =
			activeFactors.map((factor, i) => ({
				...factor,
				currentCount: currentCounts[i],
			}));
		request.activeFactors = activeFactorsWithCurrentCount;
		return activeFactorsWithCurrentCount;
	}

	public async weakHashString(val: string): Promise<string> {
		const staticSalt = this.configService.getOrThrow("CAPTCHA_SECRET", { infer: true });

		return await new Promise((resolve, reject) => {
			argon2(
				"argon2id",
				{
					message: val,
					nonce: this.runtimeSalt,
					associatedData: staticSalt,
					passes: 3,
					memory: 8192,
					parallelism: 8,
					tagLength: 32,
				},
				(err, derivedKey) => {
					if (err) {
						return reject(err);
					}

					resolve(derivedKey.toString("base64"));
				},
			);
		});
	}
}

function anonymiseIpAddr(rawIp: string) {
	let parsedIp = ipaddr.parse(rawIp);
	if (parsedIp instanceof ipaddr.IPv6 && parsedIp.isIPv4MappedAddress()) {
		parsedIp = parsedIp.toIPv4Address();
	}

	const ipBytes = parsedIp ? parsedIp.toByteArray() : undefined;
	let prefix: string;
	if (ipBytes?.length === 4) {
		prefix = ipBytes.slice(0, 3).join(".");
	} else if (ipBytes?.length === 16) {
		prefix = ipBytes.slice(0, 6).join(":");
	} else {
		throw new Error("Invalid ip bytes length " + ipBytes?.length);
	}
	return prefix;
}

function anonymiseEmailAddr(emailAddr: string) {
	const [username, domain] = emailAddr.split("@");
	const domainParts = domain.split(".");
	const partialUsername = username.slice(0, Math.max(username.length / 2));
	// tld.firstDomainPart.partialUsername
	return [...domainParts.reverse().slice(0, 2), partialUsername].join(".");
}

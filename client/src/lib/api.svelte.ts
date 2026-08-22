import { dev } from "$app/environment";
import {
	PUBLIC_DEFAULT_API_URL,
	PUBLIC_DEFAULT_API_URL_DEV,
	PUBLIC_TEST_ENVIRONMENT,
} from "$env/static/public";
import { WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY } from "$lib";
import { Settings } from "$lib/Settings";
import { solveCaptcha } from "$lib/captcha";
import { IDBStore } from "$lib/idb/IDBStore";
import { Profile } from "$lib/idb/profiles";
import { SyncWorker } from "$lib/idb/sync/SyncWorker.svelte.js";
import {
	API_VERSION,
	type GetStatus,
	GetStatusSchema,
	MISSING_REFRESH_TOKEN_COOKIE,
	OPENSELVES_NAMESPACE_ID,
	SESSION_EXPIRED_ERROR,
	TOKEN_EXPIRED_ERROR,
	readStream,
} from "openselves-common";
import { isValidSchemaStatic } from "openselves-common/schema";
import { ByteString, Ed25519 } from "openselves-common/willow";

export const navigatorOnlineState: {
	online: boolean;
} = $state({ online: navigator.onLine });

window.addEventListener("online", () => {
	navigatorOnlineState.online = true;
});
window.addEventListener("offline", () => {
	navigatorOnlineState.online = false;
});

export const DEFAULT_API_URL =
	dev || PUBLIC_TEST_ENVIRONMENT === "1" ? PUBLIC_DEFAULT_API_URL_DEV : PUBLIC_DEFAULT_API_URL;

export type Attachment = {
	id: string;
	file: Blob;
};

export type CallOptions = {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	data?: Record<string, unknown> | ReadableStream<ByteString>;
	attachments?: Attachment[];
	returnUnhandledResponses?: boolean;
	isUnauthenticated?: boolean;
	attempts?: number;
	profile?: Profile;
};

export enum CallResult {
	API_UNREACHABLE,
	SESSION_EXPIRED,
	MISSING_REFRESH_TOKEN_COOKIE,
	WRONG_VERSION,
}

const baseApiRequestHeaders = {
	Accept: "application/json",
	"X-OpenSelves-Version": API_VERSION,
};

export class Api {
	public static async callRaw(
		path: string,
		options?: CallOptions,
	): Promise<CallResult | { response: Response; responseBody?: Record<string, unknown> }> {
		const attempts = typeof options?.attempts === "number" ? options.attempts : 3;
		const profile = options?.profile ? options.profile : Profile.getCurrentProfile();
		const apiUrl = profile.api.url;
		const isFileUpload = (options?.attachments?.length || 0) > 0;

		const headers = new Headers(baseApiRequestHeaders);

		let body: BodyInit | null;
		if (isFileUpload) {
			body = new FormData();
			if (options?.data) {
				for (const [key, val] of Object.entries(options.data)) {
					body.append(key, JSON.stringify(val));
				}
			}
			for (const attachment of options?.attachments || []) {
				body.append("attachments[]", attachment.file, attachment.id);
			}
		} else {
			if (options?.data) {
				if (options.data instanceof ReadableStream) {
					headers.set("Content-Type", "application/octet-stream");

					let isSupported = false;
					try {
						new Request("", { method: "POST", body: new ReadableStream() });
					} catch {
						isSupported = true;
					}

					// TODO: when getting rid of nestjs for our own http2 server, re-enable this
					const isHttpUploadStreamingEnabled = false;
					if (isSupported && isHttpUploadStreamingEnabled) {
						body = options.data;
					} else {
						console.warn("Pre-loading request body stream");
						body = ByteString.concat(
							...(await readStream(options.data as ReadableStream<ByteString>)),
						);
					}
				} else {
					headers.set("Content-Type", "application/json");
					body = JSON.stringify(options?.data);
				}
			} else {
				body = null;
			}
		}

		const fetchInit: RequestInit = {
			method: options?.method || "GET",
			headers: headers,
			credentials: "include",
			body,
		};

		if (body instanceof ReadableStream) {
			fetchInit["duplex"] = "half";
		}

		const tryFetch = async () => await fetch(`${apiUrl}${path}`, fetchInit);
		let response: Response | undefined = undefined;
		let responseBody: Record<string, unknown> | undefined = undefined;

		let responseType: undefined | "json" | "raw";
		for (let attempt = 0; attempt < attempts; attempt++) {
			responseType = undefined;
			responseBody = undefined;

			if (attempt !== 0) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			try {
				response = await tryFetch();
				const contentType = response.headers.get("Content-Type");
				if (contentType?.startsWith("application/json")) {
					responseType = "json";
				} else if (contentType === "application/octet-stream") {
					responseType = "raw";
				}

				if (responseType === "json") {
					responseBody = await response.json();
				}
			} catch (error) {
				console.debug(
					"attempt",
					attempt,
					"got error",
					error,
					"with response",
					response,
					responseBody,
				);
			}

			if (responseBody && typeof responseBody.expectedVersion === "string") {
				await profile.setApiMismatchedRemoteVersion(responseBody.expectedVersion);
			}

			if (response && response.headers.get("X-OpenSelves-Version") !== API_VERSION) {
				console.debug(response.headers);
				return CallResult.WRONG_VERSION;
			}

			if (
				!response ||
				!(response instanceof Response) ||
				!responseType ||
				(responseType === "json" && !responseBody)
			) {
				if (!(await profile.checkApiReachable())) {
					return CallResult.API_UNREACHABLE;
				}
				continue;
			}

			if (response.ok) {
				break;
			}

			if (
				!options?.isUnauthenticated &&
				response.status === 401 &&
				responseBody &&
				responseBody.name === TOKEN_EXPIRED_ERROR
			) {
				const result = await this.refreshAccessToken(apiUrl);
				console.debug(
					"refreshAccessToken",
					typeof result === "boolean" ? result : CallResult[result].toString(),
				);

				if (attempt < attempts - 1) {
					if (
						result === CallResult.SESSION_EXPIRED ||
						result === CallResult.MISSING_REFRESH_TOKEN_COOKIE
					) {
						await this.openSession(profile);
					}
				} else {
					if (result === CallResult.MISSING_REFRESH_TOKEN_COOKIE) {
						return CallResult.SESSION_EXPIRED;
					}
				}

				continue;
			}

			if (
				response.status === 406 &&
				responseBody &&
				typeof responseBody.expectedVersion === "string"
			) {
				return CallResult.WRONG_VERSION;
			}

			if (options?.returnUnhandledResponses) {
				if (!response) {
					continue;
				}
				return { response, responseBody };
			}

			throw new Error(
				`Unhandled call response for status ${response.status} ${response.statusText}`,
				{ cause: responseBody },
			);
		}

		if (!response || (responseType === "json" && !responseBody)) {
			return CallResult.API_UNREACHABLE;
		}

		return {
			response,
			responseBody,
		};
	}

	public static async call(
		path: string,
		options?: CallOptions,
	): Promise<{ response: Response; responseBody?: Record<string, unknown> } | undefined> {
		const result = await this.callRaw(path, options);

		switch (result) {
			case CallResult.WRONG_VERSION:
			case CallResult.API_UNREACHABLE:
				this.scheduleOnlineCheck();
				return undefined;
			case CallResult.SESSION_EXPIRED:
			case CallResult.MISSING_REFRESH_TOKEN_COOKIE:
				return undefined;
			default:
				return result;
		}
	}

	public static async openSession(profile: Profile): Promise<boolean> {
		if (!profile.isSyncEnabled()) {
			throw new Error("Profile sync is not enabled on this profile", { cause: profile });
		}

		if (!profile.knownSubspaces.length) {
			console.warn("No known subspace in profile");
			return false;
		}

		if (profile.ownSubspaces.length > 1) {
			console.warn("Opening sessions for more than one owned subspace is not supported.");
			return false;
		}

		if (!profile.isApiReachable() && !(await profile.checkApiReachable())) {
			console.warn("Api is unreachable");
			return false;
		}

		const subspace = profile.ownSubspaces[0];

		const apiUrl = profile.api.url;
		let captchaResult;
		try {
			captchaResult = await solveCaptcha(apiUrl);
		} catch (e) {
			console.warn("solveCaptcha threw error", e);
			return false;
		}

		if (!captchaResult.challenge || !captchaResult.solution) {
			console.warn("Couldn't solve captcha", captchaResult);
			return false;
		}

		const challengeResponse = await this.call(`/auth/challenge`, {
			method: "POST",
			data: {
				userKey: subspace.subspaceId.toBase64(),
				captcha: captchaResult,
			},
			isUnauthenticated: true,
		});

		const challengeResponseBody = challengeResponse?.responseBody;
		if (!challengeResponseBody) {
			console.warn("Couldn't get challenge", challengeResponse);
			return false;
		}

		const challenge = challengeResponseBody["challenge"];
		if (typeof challenge !== "string") {
			console.warn("Server gave invalid /auth/challenge response", challengeResponseBody);
			return false;
		}

		const signature = await Ed25519.sign(subspace.secretKey, ByteString.fromUtf8(challenge));

		const loginResponse = await this.call(`/auth/login`, {
			method: "POST",
			data: {
				challenge,
				signature: signature.toBase64(),
				persistSession: false,
			},
			isUnauthenticated: true,
		});

		return !!loginResponse;
	}

	public static async getStatus(apiUrl: string): Promise<GetStatus | undefined> {
		try {
			const response = await fetch(`${apiUrl}/status`, {
				headers: baseApiRequestHeaders,
			});
			if (response.ok) {
				const responseBody = await response.json();
				if (!isValidSchemaStatic(GetStatusSchema, responseBody)) {
					throw new Error("Invalid GetStatus response from server", {
						cause: responseBody,
					});
				}
				return responseBody;
			}
		} catch (error) {
			console.warn("Error while fetching and parsing api status", error);
		}
		return undefined;
	}

	public static async tryLogout(
		profile: Profile,
		wipeData: boolean,
		forceWipe: boolean = false,
		apiLogoutNeeded: boolean = false,
	): Promise<boolean> {
		if (!SyncWorker.isInitialized()) {
			throw new Error("SyncWorker is not initialized");
		}

		if (!Profile.hasCurrentProfile()) {
			// We're already logged out
			return true;
		}

		if (this.onlineCheckTimeout !== undefined) {
			clearTimeout(this.onlineCheckTimeout);
			this.onlineCheckTimeout = undefined;
		}
		await SyncWorker.shutdown();

		if (wipeData) {
			if (!forceWipe && SyncWorker.hasEntriesToPush) {
				if (
					(profile.isApiReachable() || (await profile.checkApiReachable())) &&
					Profile.hasCurrentProfile()
				) {
					SyncWorker.bootstrap();
				}
				return false;
			} else {
				await Profile.wipeProfileData(profile.id);
			}
		} else {
			await Settings.set(WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY, profile.id);
		}

		await Profile.setCurrentProfile(null);
		IDBStore.free(OPENSELVES_NAMESPACE_ID);

		if (apiLogoutNeeded) {
			await this.tryApiLogout();
		}
		return true;
	}

	private static logoutAttemptTimeout: number | undefined = undefined;
	public static readonly NEEDS_API_LOGOUT_STORAGE_KEY = "needsApiLogout";
	public static async needsApiLogout(): Promise<boolean> {
		return !!(await Settings.get(this.NEEDS_API_LOGOUT_STORAGE_KEY));
	}
	public static async tryApiLogout(delay: number = 0, firstCall: boolean = true) {
		console.debug("Scheduling api logout...");
		clearTimeout(this.logoutAttemptTimeout);
		if (firstCall) {
			await Settings.set(this.NEEDS_API_LOGOUT_STORAGE_KEY, "1");
		}

		this.logoutAttemptTimeout = window.setTimeout(async () => {
			const profile = Profile.getCurrentProfile();

			if (profile.isApiReachable()) {
				const result = await this.call("/auth/logout", {
					method: "POST",
				});
				if (result) {
					console.debug("Api logout success!");
					await Settings.delete(this.NEEDS_API_LOGOUT_STORAGE_KEY);
					return;
				}
			}

			console.debug("Api logout failure.");
			return this.tryApiLogout(5000, false);
		}, delay);
	}

	private static onlineCheckTimeout: number | undefined = undefined;
	public static async scheduleOnlineCheck(delay: number = 5000) {
		clearTimeout(this.onlineCheckTimeout);

		this.onlineCheckTimeout = window.setTimeout(async () => {
			console.debug("Checking for api reachability");
			const profile = Profile.getCurrentProfile();
			let reachable = false;
			try {
				if (await profile.checkApiReachable()) {
					reachable = true;
				}
			} finally {
				if (!reachable) {
					this.scheduleOnlineCheck();
				}
			}
		}, delay);
	}

	private static async refreshAccessToken(
		apiUrl: string,
	): Promise<boolean | CallResult.SESSION_EXPIRED | CallResult.MISSING_REFRESH_TOKEN_COOKIE> {
		try {
			const response = await fetch(`${apiUrl}/auth/refresh`, {
				method: "POST",
				credentials: "include",
				headers: baseApiRequestHeaders,
			});

			const responseBody = await response.json();
			if (!response.ok && response.status === 401) {
				if (responseBody.name === SESSION_EXPIRED_ERROR) {
					console.warn("Session expired with response", responseBody);
					return CallResult.SESSION_EXPIRED;
				} else if (responseBody.name === MISSING_REFRESH_TOKEN_COOKIE) {
					console.warn("Refresh token cookie missing with response", responseBody);
					return CallResult.MISSING_REFRESH_TOKEN_COOKIE;
				}
			}

			return response.ok;
		} catch (e) {
			console.error(e);
			return false;
		}
	}
}

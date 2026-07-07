import { dev } from "$app/environment";
import {
	PUBLIC_DEFAULT_API_URL,
	PUBLIC_DEFAULT_API_URL_DEV,
	PUBLIC_TEST_ENVIRONMENT,
} from "$env/static/public";
import { WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY } from "$lib";
import { PersistentStorage } from "$lib/PersistentStorage";
import { appState } from "$lib/appState.svelte.js";
import { IDBStore } from "$lib/idb/IDBStore";
import { SyncWorker } from "$lib/idb/SyncWorker.js";
import { LocalProfileManager } from "$lib/idb/local-profiles";
import { gotoHomeRoute } from "$lib/routing-utils";
import {
	API_VERSION,
	GetStatus,
	type GetStatusResult,
	GetUser,
	MISSING_REFRESH_TOKEN_COOKIE,
	SESSION_EXPIRED_ERROR,
	TOKEN_EXPIRED_ERROR,
	parseApiResult,
} from "openselves-common";
import { OPENSELVES_NAMESPACE_ID } from "openselves-common/willow";

export const apiState: {
	url: string;
	mismatchedRemoteVersion: string | undefined;
	status: GetStatusResult | undefined;
} = $state({
	url:
		dev || PUBLIC_TEST_ENVIRONMENT === "1"
			? PUBLIC_DEFAULT_API_URL_DEV
			: PUBLIC_DEFAULT_API_URL,
	status: undefined,
	mismatchedRemoteVersion: undefined,
});

export const SERVER_URL_STORAGE_KEY = "serverUrl";
export const SERVER_STATUS_STORAGE_KEY = "serverStatus";
export const USER_DATA_STORAGE_KEY = "userData";

export async function setServerUrl(newUrl: string) {
	apiState.url = newUrl;
	await PersistentStorage.getInstance().set(SERVER_URL_STORAGE_KEY, newUrl, true);
}

export async function setApiStatus(status: GetStatusResult) {
	apiState.status = status;
	await PersistentStorage.getInstance().set(
		SERVER_STATUS_STORAGE_KEY,
		JSON.stringify(status),
		true,
	);
}

async function refreshUserData() {
	if (!appState.isAuthenticated) {
		throw new Error("Cannot use while not authenticated.");
	}

	const storage = PersistentStorage.getInstance();
	const userId = storage.getUserId();
	const result = await call(`/user/${userId}`);
	if (!result) {
		throw new Error("Couldn't fetch user data");
	}
	appState.userData = parseApiResult(GetUser, result.responseBody);
	await storage.set(USER_DATA_STORAGE_KEY, JSON.stringify(appState.userData));
}

let refreshUserDataTimeout: number | undefined = undefined;
export function scheduleRefreshUserData(delay: number = 5000) {
	if (!appState.isAuthenticated) {
		if (delay === 0 && !appState.isAuthenticated) {
			throw new Error("Cannot use while not authenticated.");
		}
		return;
	}

	clearTimeout(refreshUserDataTimeout);

	refreshUserDataTimeout = window.setTimeout(async () => {
		if (!appState.isAuthenticated) {
			return;
		}

		try {
			await refreshUserData();
		} catch (e) {
			console.debug("refreshUserData failed", e);
			scheduleRefreshUserData();
			return;
		}
	}, delay);
}

export type Attachment = {
	id: string;
	file: Blob;
};

export type CallOptions = {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	data?: Record<string, unknown>;
	attachments?: Attachment[];
	returnUnhandledResponses?: boolean;
	isUnauthenticated?: boolean;
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

export async function callRaw(
	path: string,
	options?: CallOptions,
): Promise<CallResult | { response: Response; responseBody: Record<string, unknown> }> {
	const isFileUpload = (options?.attachments?.length || 0) > 0;

	const headers: Record<string, string> = { ...baseApiRequestHeaders };
	if (options?.data && !isFileUpload) {
		headers["Content-Type"] = "application/json";
	}

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
		body = options?.data ? JSON.stringify(options?.data) : null;
	}

	const fetchInit: RequestInit = {
		method: options?.method || "GET",
		headers: headers,
		credentials: "include",
		body,
	};

	const tryFetch = async () => await fetch(`${apiState.url}${path}`, fetchInit);
	let response: Response | undefined = undefined;
	let responseBody: Record<string, unknown> | undefined = undefined;

	for (let attempt = 0; attempt < 3; attempt++) {
		if (attempt !== 0) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		try {
			response = await tryFetch();
			responseBody = await response.json();
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

		if (responseBody && typeof responseBody?.expectedVersion === "string") {
			apiState.mismatchedRemoteVersion = responseBody.expectedVersion;
		}

		if (response && response.headers.get("X-OpenSelves-Version") !== API_VERSION) {
			console.debug(response.headers);
			return CallResult.WRONG_VERSION;
		}

		if (!response || !(response instanceof Response) || !responseBody) {
			if (!(await isApiReachable())) {
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
			responseBody.name === TOKEN_EXPIRED_ERROR
		) {
			const result = await refreshAuth();
			console.debug(
				"refreshAuth",
				typeof result === "boolean" ? result : CallResult[result].toString(),
			);
			if (
				result === CallResult.SESSION_EXPIRED ||
				(attempt === 2 && result === CallResult.MISSING_REFRESH_TOKEN_COOKIE)
			) {
				return CallResult.SESSION_EXPIRED;
			}

			continue;
		}

		if (response.status === 406 && typeof responseBody.expectedVersion === "string") {
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

	if (!response || !responseBody) {
		return CallResult.API_UNREACHABLE;
	}

	return {
		response,
		responseBody,
	};
}

export async function call(
	path: string,
	options?: CallOptions,
): Promise<{ response: Response; responseBody: Record<string, unknown> } | undefined> {
	const result = await callRaw(path, options);

	switch (result) {
		case CallResult.SESSION_EXPIRED:
			console.debug("Got result", result, "from callRaw");
			await tryLogout(false);
			await gotoHomeRoute({
				session_expired: "1",
				call_path: path,
			});
			return undefined;
		case CallResult.API_UNREACHABLE:
		case CallResult.MISSING_REFRESH_TOKEN_COOKIE:
		case CallResult.WRONG_VERSION:
			handleApiUnreachable();
			return undefined;
		default:
			return result;
	}
}

let refreshingAuthPromise: Promise<
	boolean | CallResult.SESSION_EXPIRED | CallResult.MISSING_REFRESH_TOKEN_COOKIE
> | null = null;
async function refreshAuth(): Promise<
	boolean | CallResult.SESSION_EXPIRED | CallResult.MISSING_REFRESH_TOKEN_COOKIE
> {
	if (refreshingAuthPromise) {
		try {
			return await refreshingAuthPromise;
		} catch {
			return false;
		}
	}

	try {
		return await (refreshingAuthPromise = (async () => {
			const authResponse = await fetch(`${apiState.url}/auth/refresh`, {
				method: "POST",
				credentials: "include",
				headers: baseApiRequestHeaders,
			});

			const authResponseBody = await authResponse.json();
			if (!authResponse.ok && authResponse.status === 401) {
				if (authResponseBody.name === SESSION_EXPIRED_ERROR) {
					console.warn("Session expired with response", authResponseBody);
					return CallResult.SESSION_EXPIRED;
				} else if (authResponseBody.name === MISSING_REFRESH_TOKEN_COOKIE) {
					console.warn("Refresh token cookie missing with response", authResponseBody);
					return CallResult.MISSING_REFRESH_TOKEN_COOKIE;
				}
			}

			return authResponse.ok;
		})());
	} catch (e) {
		console.error(e);
		return false;
	} finally {
		refreshingAuthPromise = null;
	}
}

async function isApiReachable(): Promise<boolean> {
	const debugData: unknown[] = [];
	try {
		const response = await fetch(`${apiState.url}/status`, {
			headers: baseApiRequestHeaders,
		});
		if (response.ok) {
			const status = parseApiResult(GetStatus, await response.json());
			if (status.ready && status.version === API_VERSION) {
				console.debug("online");
				await setApiStatus(status);
				return true;
			}
			debugData.push(status);
		}
		debugData.push(response);
	} catch (error) {
		debugData.push(error);
	}
	console.debug("offline", debugData);
	return false;
}

export async function tryLogout(
	wipeData: boolean,
	forceWipe: boolean = false,
	apiLogoutNeeded: boolean = false,
): Promise<boolean> {
	if (!SyncWorker.isInitialized()) {
		throw new Error("SyncWorker is not initialized");
	}

	if (!appState.isAuthenticated) {
		// We're already logged out
		return true;
	}

	if (onlineCheckTimeout !== undefined) {
		clearTimeout(onlineCheckTimeout);
		onlineCheckTimeout = undefined;
	}
	await SyncWorker.getInstance().shutdown();
	const storage = PersistentStorage.getInstance();
	const userId = storage.getUserId();

	if (wipeData) {
		if (!forceWipe && SyncWorker.getInstance().hasPushBacklog()) {
			if (appState.isApiReachable && appState.isAuthenticated) {
				SyncWorker.getInstance().resume();
			}
			scheduleOnlineCheck();
			return false;
		} else {
			await LocalProfileManager.getInstance().wipeUserData(userId);
		}
	} else {
		await storage.set(WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY, userId, true);
	}

	await storage.setOffline();
	IDBStore.free(OPENSELVES_NAMESPACE_ID);

	if (apiLogoutNeeded) {
		await tryApiLogout();
	}
	return true;
}

let logoutAttemptTimeout: number | undefined = undefined;
const NEEDS_API_LOGOUT_STORAGE_KEY = "needsApiLogout";
export async function needsApiLogout(): Promise<boolean> {
	return !!(await PersistentStorage.getInstance().get(NEEDS_API_LOGOUT_STORAGE_KEY, true));
}
export async function tryApiLogout(delay: number = 0, firstCall: boolean = true) {
	console.debug("Scheduling api logout...");
	clearTimeout(logoutAttemptTimeout);
	const storage = PersistentStorage.getInstance();
	if (firstCall) {
		await storage.set(NEEDS_API_LOGOUT_STORAGE_KEY, "1", true);
	}

	logoutAttemptTimeout = window.setTimeout(async () => {
		if (appState.isApiReachable) {
			const result = await call("/auth/logout", {
				method: "POST",
			});
			if (result) {
				console.debug("Api logout success!");
				await storage.delete(NEEDS_API_LOGOUT_STORAGE_KEY, true);
				return;
			}
		}

		console.debug("Api logout failure.");
		return tryApiLogout(5000, false);
	}, delay);
}

let onlineCheckTimeout: number | undefined = undefined;
export function handleApiUnreachable() {
	appState.isApiReachable = false;
	SyncWorker.getInstance().pause();
	scheduleOnlineCheck();
}

export function scheduleOnlineCheck(delay: number = 5000) {
	clearTimeout(onlineCheckTimeout);

	onlineCheckTimeout = window.setTimeout(async () => {
		console.debug("Checking for api reachability");
		let reachable = false;
		try {
			if (await isApiReachable()) {
				reachable = true;
				appState.isApiReachable = true;
				if (appState.isAuthenticated) {
					SyncWorker.getInstance().resume();
				}
			}
		} finally {
			if (!reachable) {
				appState.isApiReachable = false;
				scheduleOnlineCheck();
			}
		}
	}, delay);
}

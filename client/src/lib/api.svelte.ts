import { dev } from "$app/environment";
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import {
	PUBLIC_DEFAULT_API_URL,
	PUBLIC_DEFAULT_API_URL_DEV,
	PUBLIC_TEST_ENVIRONMENT,
} from "$env/static/public";
import { PersistentStorage } from "$lib/PersistentStorage";
import { appState } from "$lib/appState.svelte.js";
import type { Attachment } from "$lib/idb/IDBAttachment";
import { SyncWorker } from "$lib/idb/SyncWorker.js";
import { API_VERSION, SESSION_EXPIRED_ERROR, TOKEN_EXPIRED_ERROR } from "openselves-common";

export const apiState: {
	url: string;
	maxUploadSize: number | undefined;
	areRegistrationsOpen: boolean | undefined;
	mismatchedRemoteVersion: string | undefined;
} = $state({
	url:
		dev || PUBLIC_TEST_ENVIRONMENT === "1"
			? PUBLIC_DEFAULT_API_URL_DEV
			: PUBLIC_DEFAULT_API_URL,
	maxUploadSize: undefined,
	areRegistrationsOpen: undefined,
	mismatchedRemoteVersion: undefined,
});

export const SERVER_URL_STORAGE_KEY = "serverUrl";
export const SERVER_MAX_UPLOAD_SIZE_STORAGE_KEY = "maxUploadSize";

export async function setServerUrl(newUrl: string) {
	apiState.url = newUrl;
	await PersistentStorage.getInstance().setRaw(SERVER_URL_STORAGE_KEY, newUrl);
}

export async function setMaxUploadSize(maxUploadSize: number) {
	apiState.maxUploadSize = maxUploadSize;
	await PersistentStorage.getInstance().setRaw(
		SERVER_MAX_UPLOAD_SIZE_STORAGE_KEY,
		maxUploadSize.toString(),
	);
}

export type CallOptions<RawResponse extends true | false> = {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	data?: Record<string, unknown>;
	attachments?: Attachment[];
	returnRawResponse?: RawResponse;
};

export enum CallResult {
	API_UNREACHABLE,
	SESSION_EXPIRED,
	WRONG_VERSION,
}

const baseApiRequestHeaders = {
	Accept: "application/json",
	"X-OpenSelves-Version": API_VERSION,
};

export async function callRaw(
	path: string,
	options: CallOptions<true>,
): Promise<CallResult | Response>;
export async function callRaw(
	path: string,
	options?: CallOptions<false>,
): Promise<CallResult | Record<string, unknown>>;
export async function callRaw(
	path: string,
	options?: CallOptions<true | false>,
): Promise<CallResult | Response | Record<string, unknown>>;
export async function callRaw(
	path: string,
	options?: CallOptions<true | false>,
): Promise<CallResult | Response | Record<string, unknown>> {
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
		try {
			response = await tryFetch();
			if (!options?.returnRawResponse) {
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

		if (responseBody && typeof responseBody?.expectedVersion === "string") {
			apiState.mismatchedRemoteVersion = responseBody.expectedVersion;
		}

		if (response && response.headers.get("X-OpenSelves-Version") !== API_VERSION) {
			console.debug(response.headers);
			return CallResult.WRONG_VERSION;
		}

		if (options?.returnRawResponse) {
			if (!response) {
				continue;
			}
			return response;
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

		if (response.status === 401 && responseBody.name === TOKEN_EXPIRED_ERROR) {
			if (!(await refreshAuth())) {
				return CallResult.SESSION_EXPIRED;
			}

			continue;
		}

		if (response.status === 406 && typeof responseBody.expectedVersion === "string") {
			return CallResult.WRONG_VERSION;
		}

		throw new Error(
			`Unhandled call response for status ${response.status} ${response.statusText}`,
			{ cause: responseBody },
		);
	}

	if (!responseBody) {
		return CallResult.API_UNREACHABLE;
	}

	return responseBody;
}

export async function call(path: string, options: CallOptions<true>): Promise<Response>;
export async function call(
	path: string,
	options?: CallOptions<false>,
): Promise<Record<string, unknown> | undefined>;
export async function call(
	path: string,
	options?: CallOptions<true | false>,
): Promise<Record<string, unknown> | Response | undefined>;
export async function call(
	path: string,
	options?: CallOptions<true | false>,
): Promise<Record<string, unknown> | Response | undefined> {
	const result = await callRaw(path, options);

	if (options?.returnRawResponse && result instanceof Response) {
		return result;
	}

	switch (result) {
		case CallResult.SESSION_EXPIRED:
			await handleLogout();
			return undefined;
		case CallResult.API_UNREACHABLE:
		case CallResult.WRONG_VERSION:
			handleApiUnreachable();
			return undefined;
		default:
			return result;
	}
}

let refreshingAuthPromise: Promise<void> | null = null;
async function refreshAuth(): Promise<boolean> {
	while (refreshingAuthPromise) {
		try {
			await refreshingAuthPromise;
		} catch {
			return false;
		}
	}

	try {
		await (refreshingAuthPromise = (async () => {
			const authResponse = await fetch(`${apiState.url}/auth/refresh`, {
				method: "POST",
				credentials: "include",
				headers: baseApiRequestHeaders,
			});

			const authResponseBody = await authResponse.json();
			if (
				!authResponse.ok &&
				authResponse.status === 401 &&
				authResponseBody.name === SESSION_EXPIRED_ERROR
			) {
				console.warn("Session expired with response", authResponseBody);
				throw undefined;
			}
		})());
		return true;
	} catch {
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
			const responseBody = await response.json();
			if (responseBody.ready === true && responseBody.version === API_VERSION) {
				console.debug("online");
				await setMaxUploadSize(responseBody.maxUploadSize);
				apiState.areRegistrationsOpen = !!responseBody.areRegistrationsOpen;
				return true;
			}
			debugData.push(responseBody);
		}
		debugData.push(response);
	} catch (error) {
		debugData.push(error);
	}
	console.debug("offline", debugData);
	return false;
}

export async function handleLogout() {
	if (onlineCheckTimeout !== undefined) {
		clearTimeout(onlineCheckTimeout);
		onlineCheckTimeout = undefined;
	}
	await SyncWorker.getInstance().shutdown();
	await PersistentStorage.getInstance().setOffline();
	await goto(resolve("/"));
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

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
import { SyncWorker } from "$lib/idb/SyncWorker.js";
import { TOKEN_EXPIRED_ERROR } from "openselves-common";

export const apiState = $state({
	url:
		dev || PUBLIC_TEST_ENVIRONMENT === "1"
			? PUBLIC_DEFAULT_API_URL_DEV
			: PUBLIC_DEFAULT_API_URL,
});

export const SERVER_URL_STORAGE_KEY = "serverUrl";

export async function setServerUrl(newUrl: string) {
	apiState.url = newUrl;
	await PersistentStorage.getInstance().setRaw(SERVER_URL_STORAGE_KEY, newUrl);
}

export type CallOptions<RawResponse extends true | false> = {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	data?: Record<string, unknown>;
	dontRefreshAuthOnUnauthorized?: boolean;
	returnRawResponse?: RawResponse;
};

export enum CallResult {
	AUTH_FAILED,
	API_UNREACHABLE,
}

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
	const headers: Record<string, string> = {
		Accept: "application/json",
	};
	if (options?.data) {
		headers["Content-Type"] = "application/json";
	}

	const fetchInit: RequestInit = {
		method: options?.method || "GET",
		headers: headers,
		credentials: "include",
		body: options?.data ? JSON.stringify(options?.data) : null,
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
			if (!options?.dontRefreshAuthOnUnauthorized && (await refreshAuth())) {
				continue;
			}

			return CallResult.AUTH_FAILED;
		}

		throw new Error(
			`Unhandled call response for status ${response.status} ${response.statusText}`,
			{ cause: responseBody },
		);
	}

	if (!responseBody) {
		throw new Error("Could not obtain response body");
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
		case CallResult.AUTH_FAILED:
			await handleLogout();
			return undefined;
		case CallResult.API_UNREACHABLE:
			handleApiUnreachable();
			return undefined;
		default:
			return result;
	}
}

async function isApiReachable(): Promise<boolean> {
	const debugData: unknown[] = [];
	try {
		const response = await fetch(`${apiState.url}/status`);
		if (response.ok) {
			const responseBody = await response.json();
			if (responseBody.ready === true) {
				console.debug("online");
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

async function refreshAuth(): Promise<boolean> {
	const response = await fetch(`${apiState.url}/auth/refresh`, {
		method: "POST",
		credentials: "include",
	});
	return response.ok;
}

export async function handleLogout() {
	clearTimeout(onlineCheckTimeout);
	await SyncWorker.getInstance().shutdown();
	await PersistentStorage.getInstance().setOffline();
	await goto(resolve("/"));
}

let onlineCheckTimeout: number | undefined = undefined;
export function handleApiUnreachable() {
	SyncWorker.getInstance().pause();
	scheduleOnlineCheck();
}

function scheduleOnlineCheck() {
	clearTimeout(onlineCheckTimeout);

	onlineCheckTimeout = window.setTimeout(async () => {
		console.debug("Checking for api reachability");
		let reachable = false;
		try {
			if (await isApiReachable()) {
				reachable = true;
				if (appState.isAuthenticated) {
					SyncWorker.getInstance().resume();
				}
			}
		} finally {
			if (!reachable) {
				scheduleOnlineCheck();
			}
		}
	}, 5000);
}

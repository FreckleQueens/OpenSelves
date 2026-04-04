// place files you want to import through the `$lib` alias in this folder.
import { dev } from "$app/environment";
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { PUBLIC_TEST_ENVIRONMENT } from "$env/static/public";
import { SyncWorker } from "$lib/idb/SyncWorker.svelte";
import { Storage } from "$lib/storage";
import { TOKEN_EXPIRED_ERROR } from "openselves-common";

export const SERVER_URL =
	dev || PUBLIC_TEST_ENVIRONMENT === "1" ? "http://127.0.0.1:3000" : "https://api.openselves.org";

export type AuthFormData = {
	name: string;
	errors: Record<string, string>;
	generalError: string;
	endpoint: string;
	data: Record<string, string>;
	onSuccess: (result: object) => Promise<unknown> | unknown;
};

export type CallOptions = {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	data?: Record<string, unknown>;
	dontRefreshAuthOnUnauthorized?: boolean;
};

async function refreshAuth(): Promise<boolean> {
	const response = await fetch(`${SERVER_URL}/auth/refresh`, {
		method: "POST",
		credentials: "include",
	});
	return response.ok;
}

export enum CallResult {
	AUTH_FAILED,
}

export async function call(
	path: string,
	options?: CallOptions,
): Promise<CallResult | Record<string, unknown>> {
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

	const tryFetch = async () => await fetch(`${SERVER_URL}${path}`, fetchInit);
	let response: Response | undefined = undefined;
	let responseBody: Record<string, unknown> | undefined = undefined;

	for (let attempt = 0; attempt < 3; attempt++) {
		response = await tryFetch();
		responseBody = await response.json();
		if (!responseBody) {
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

export async function handleLogout() {
	await SyncWorker.getInstance().shutdown();
	const storage = await Storage.getStorage();
	await storage.setOffline();
	await goto(resolve("/"));
}

export enum MenuItem {
	HOME,
	MEMBERS,
}

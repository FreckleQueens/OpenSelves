import { transformErrorToReadable } from "$lib";
import { initApp } from "$lib/init";
import type { ClientInit, HandleClientError } from "@sveltejs/kit";

export const handleError: HandleClientError = async ({ error, event, status, message }) => {
	return {
		status,
		message,
		event,
		error: transformErrorToReadable(error),
	};
};

export const init: ClientInit = async () => {
	await initApp();
};

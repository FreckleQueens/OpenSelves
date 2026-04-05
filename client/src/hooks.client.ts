import type { HandleClientError } from "@sveltejs/kit";

export function transformErrorToReadable(error: unknown) {
	return {
		val: error?.toString?.(),
		name: error?.["name"],
		message: error?.["message"],
		fileName: error?.["fileName"],
		lineNumber: error?.["lineNumber"],
		stack: error?.["stack"],
	};
}

export const handleError: HandleClientError = async ({ error, event, status, message }) => {
	return {
		status,
		message,
		event,
		error: transformErrorToReadable(error),
	};
};

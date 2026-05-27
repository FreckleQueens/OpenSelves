import { transformErrorToReadable } from "$lib";

export const globalError: unknown[] = $state([]);

window.addEventListener("error", (event) => {
	globalError.push(transformErrorToReadable(event.error));
});
window.addEventListener("unhandledrejection", (event) => {
	globalError.push(transformErrorToReadable(event.reason));
});

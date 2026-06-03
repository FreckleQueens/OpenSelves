// place files you want to import through the `$lib` alias in this folder.
export const USER_LANDED_STORAGE_KEY = "userLanded";

export enum MenuItem {
	FRONT,
	MEMBERS,
	ACCOUNT,
	SETTINGS,
}

export type ClickEventHandler = (event: MouseEvent) => Promise<void> | void;

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

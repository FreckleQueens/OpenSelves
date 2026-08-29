export const USER_LANDED_STORAGE_KEY = "userLanded";
export const WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY = "warnForRemainingLocalData";
export const MAX_DATA_URL_LENGTH = 8192;

export enum MenuItem {
	DASHBOARD,
	MEMBERS,
	PROFILE,
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
		cause: error?.["cause"],
	};
}

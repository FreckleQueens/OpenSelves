// place files you want to import through the `$lib` alias in this folder.

export const USER_LANDED_STORAGE_KEY = "userLanded";

export enum MenuItem {
	HOME,
	FRONT,
	MEMBERS,
}

export type ClickEventHandler = (event: MouseEvent) => Promise<void> | void;

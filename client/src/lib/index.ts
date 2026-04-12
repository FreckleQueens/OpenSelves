// place files you want to import through the `$lib` alias in this folder.

export const USER_LANDED_STORAGE_KEY = "userLanded";

export type AuthFormData = {
	name: string;
	errors: Record<string, string>;
	generalError: string;
	endpoint: string;
	data: Record<string, string>;
	onSuccess: (result: object) => Promise<unknown> | unknown;
};

export enum MenuItem {
	HOME,
	FRONT,
	MEMBERS,
}

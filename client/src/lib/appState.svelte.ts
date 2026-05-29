import type { GetUserResult } from "openselves-common";

export const appState: {
	isAuthenticated: boolean;
	userData: GetUserResult | undefined;
	syncWorkerOnline: boolean;
	syncWorkerError: never | null;
	isApiReachable: boolean;
} = $state({
	isAuthenticated: false,
	userData: undefined,
	syncWorkerOnline: false,
	syncWorkerError: null,
	isApiReachable: false,
});

export const appState: {
	isAuthenticated: boolean;
	syncWorkerOnline: boolean;
	syncWorkerError: never | null;
	isApiReachable: boolean;
} = $state({
	isAuthenticated: false,
	syncWorkerOnline: false,
	syncWorkerError: null,
	isApiReachable: false,
});

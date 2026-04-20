export const appState: {
	isAuthenticated: boolean;
	syncWorkerOnline: boolean;
	syncWorkerError: never | null;
} = $state({
	isAuthenticated: false,
	syncWorkerOnline: false,
	syncWorkerError: null,
});

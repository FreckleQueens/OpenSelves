export const appNetworkStatus: {
	storageOnline: boolean;
	syncWorkerOnline: boolean;
	syncWorkerError: never | null;
} = $state({
	storageOnline: false,
	syncWorkerOnline: false,
	syncWorkerError: null,
});

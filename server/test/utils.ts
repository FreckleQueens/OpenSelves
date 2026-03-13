export async function waitFor(timeInMs: number) {
	return new Promise((resolve) => setTimeout(resolve, timeInMs));
}

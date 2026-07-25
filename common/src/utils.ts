export const shuffleArray = <T>(array: T[]): T[] => {
	const newArray = [...array];
	for (let i = newArray.length - 1; i > 0; i--) {
		const randomIndex = Math.floor(Math.random() * (i + 1));
		[newArray[i], newArray[randomIndex]] = [newArray[randomIndex], newArray[i]];
	}
	return newArray;
};

export async function readStream<T>(
	stream: ReadableStream<T>,
	options?: {
		onValue?: (value: T) => unknown;
		onError?: (error: unknown) => unknown;
	},
): Promise<T[]> {
	const output: T[] = [];
	const reader = stream.getReader();
	while (true) {
		let result: ReadableStreamReadValueResult<T> | ReadableStreamReadDoneResult<T>;
		try {
			result = await reader.read();
		} catch (e) {
			if (options?.onError) {
				await options.onError(e);
				continue;
			} else {
				throw e;
			}
		}

		if (result.value) {
			output.push(result.value);
			if (options?.onValue) {
				await options.onValue(result.value);
			}
		}

		if (result.done) {
			break;
		}
	}
	return output;
}

export function sortBy<T>(
	direction: "asc" | "desc" | ((obj: T) => string | boolean | number),
	...valueGetters: ((obj: T) => string | boolean | number)[]
): (a: T, b: T) => number {
	let directionMultiplier: number;
	if (typeof direction === "string") {
		directionMultiplier = direction === "asc" ? 1 : -1;
	} else {
		directionMultiplier = 1;
		valueGetters = [direction, ...valueGetters];
	}
	return (a: T, b: T) => {
		for (let i = 0; i < valueGetters.length; i++) {
			const fieldGetter = valueGetters[i];
			let aValue = fieldGetter(a),
				bValue = fieldGetter(b);
			if (typeof aValue === "string" && typeof bValue === "string") {
				aValue = aValue.toLowerCase();
				bValue = bValue.toLowerCase();
			}
			if (aValue < bValue) {
				return -1 * directionMultiplier;
			}
			if (aValue > bValue) {
				return 1 * directionMultiplier;
			}
		}
		return 0;
	};
}

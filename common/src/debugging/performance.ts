export function logPerformanceMarkDeltas() {
	const marks: Record<string, number> = {};
	const observer = new PerformanceObserver((entries) => {
		for (const entry of entries.getEntries()) {
			if (marks[entry.name]) {
				console.debug("PERF", entry.name, entry.startTime - marks[entry.name]);
				delete marks[entry.name];
			} else {
				marks[entry.name] = entry.startTime;
			}
		}
	});
	observer.observe({
		type: "mark",
		buffered: true,
	});
}

import { createId } from "@paralleldrive/cuid2";

import { type Entry, isEntryNewerThan } from "./Entry.js";
import { Area } from "./meadowcap/Area.js";

export abstract class Store<T extends Entry, Context = void> {
	constructor(public readonly namespaceId: string) {}

	public abstract getEntries(context?: Context): T[];

	protected abstract addRemoveEntries(
		entryToAdd: T,
		entriesToRemove: T[],
		context?: Context,
	): Promise<void>;

	/**
	 * @returns the surviving, ingested entries
	 */
	public async ingest(entries: T[], context?: Context): Promise<T[]> {
		const mark = `ingest.${createId()}`;
		performance.mark(mark);

		const ingestedEntries: T[] = [];

		for (const entryToIngest of entries) {
			if (entryToIngest.namespaceId !== this.namespaceId) {
				throw new Error("Tried to ingest entry with wrong namespaceId", {
					cause: {
						actual: entryToIngest.namespaceId,
						expected: this.namespaceId,
					},
				});
			}

			const existingEntries = this.getEntries(context);

			// Drop incoming older path-prefixed entries
			if (
				existingEntries.find(
					(entry) =>
						entry.subspaceId === entryToIngest.subspaceId &&
						entryToIngest.path.startsWith(entry.path) &&
						!isEntryNewerThan(entryToIngest, entry),
				)
			) {
				continue;
			}

			// Delete in-store older path-prefixed entries
			const entriesToDelete = existingEntries.filter(
				(entry) =>
					entry.subspaceId === entryToIngest.subspaceId &&
					entry.path.startsWith(entryToIngest.path) &&
					isEntryNewerThan(entryToIngest, entry),
			);

			await this.addRemoveEntries(entryToIngest, entriesToDelete, context);
			ingestedEntries.push(entryToIngest);
		}

		performance.mark(mark);

		return ingestedEntries;
	}

	public area(
		subspaceId: string | undefined = undefined,
		path: string = "/",
		timesStart: bigint = 0n,
		timesEnd: bigint | "open" = "open",
	): Area<T, Context> {
		return new Area(this, subspaceId, path, timesStart, timesEnd);
	}
}

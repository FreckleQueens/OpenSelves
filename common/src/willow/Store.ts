import { createId } from "@paralleldrive/cuid2";

import { Area } from "./Area.js";
import { Entry } from "./Entry.js";
import { NamespaceId } from "./NamespaceId.js";
import { Path } from "./Path.js";
import { SubspaceId } from "./SubspaceId.js";
import type { Timestamp } from "./Timestamp.js";

export abstract class Store<T extends Entry, Context = void> {
	constructor(public readonly namespaceId: NamespaceId) {}

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
			if (!NamespaceId.equals(entryToIngest.namespaceId, this.namespaceId)) {
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
						SubspaceId.equals(entry.subspaceId, entryToIngest.subspaceId) &&
						Path.extends(entryToIngest.path, entry.path) &&
						!Entry.isNewer(entryToIngest, entry),
				)
			) {
				continue;
			}

			// Delete in-store older path-prefixed entries
			const entriesToDelete = existingEntries.filter(
				(entry) =>
					SubspaceId.equals(entry.subspaceId, entryToIngest.subspaceId) &&
					Path.extends(entry.path, entryToIngest.path) &&
					Entry.isNewer(entryToIngest, entry),
			);

			await this.addRemoveEntries(entryToIngest, entriesToDelete, context);
			ingestedEntries.push(entryToIngest);
		}

		performance.mark(mark);

		return ingestedEntries;
	}

	public area(
		subspaceId: SubspaceId | undefined = undefined,
		path: Path = [],
		timesStart: Timestamp = 0n,
		timesEnd: Timestamp | "open" = "open",
	): Area<T, Context> {
		return new Area(this, subspaceId, path, timesStart, timesEnd);
	}
}

import { ByteProvider } from "./ByteProvider.js";
import { ByteString } from "./ByteString.js";
import { NamespaceId } from "./NamespaceId.js";
import { Path } from "./Path.js";
import { PayloadDigest } from "./PayloadDigest.js";
import { SubspaceId } from "./SubspaceId.js";
import { UInt64 } from "./UInt64.js";
import { AuthorisedEntryWithPayload } from "./extension/index.js";
import { AuthorisationToken, AuthorisedEntry } from "./meadowcap/index.js";

/**
 * https://willowprotocol.org/specs/drop-format/index.html
 */
export class Drop {
	/**
	 * https://willowprotocol.org/specs/drop-format/index.html#drop_format_desc
	 */
	public static encoder(): TransformStream<AuthorisedEntryWithPayload, ByteString> {
		let previousEntry: AuthorisedEntry = AuthorisedEntry.default();

		return new TransformStream<AuthorisedEntryWithPayload, ByteString>({
			transform(entry, controller) {
				const hasNamespaceId = !NamespaceId.equals(
					entry.namespaceId,
					previousEntry.namespaceId,
				);
				const hasSubspaceId = !SubspaceId.equals(
					entry.subspaceId,
					previousEntry.subspaceId,
				);
				const timestamp = UInt64.toCompactEncoding(entry.timestamp, 2);

				let headerByte = 0b0100_0000;
				if (hasNamespaceId) {
					headerByte |= 0b0010_0000;
				}
				if (hasSubspaceId) {
					headerByte |= 0b0001_0000;
				}
				headerByte |= timestamp.tag << 2;
				// Payload slice is one single bytestring: the raw payload
				headerByte |= 0b0000_0001;

				controller.enqueue(ByteString.of(headerByte));

				if (hasNamespaceId) {
					controller.enqueue(NamespaceId.encode(entry.namespaceId));
				}
				if (hasSubspaceId) {
					controller.enqueue(SubspaceId.encode(entry.subspaceId));
				}

				controller.enqueue(Path.encodePathRelativePath(entry.path, previousEntry.path));
				controller.enqueue(timestamp.additionalBytes);
				controller.enqueue(UInt64.encodeToVariable8(entry.payloadLength));

				controller.enqueue(
					AuthorisationToken.encodeAuthorisationTokenRelative(entry.authorisationToken, {
						authorisedEntry: previousEntry,
						entry: entry,
					}),
				);

				controller.enqueue(PayloadDigest.encode(entry.payloadDigest));
				controller.enqueue(entry.payload);

				previousEntry = entry;
			},
			flush(controller) {
				// Final null byte
				controller.enqueue(new Uint8Array([0x00]));
			},
		});
	}

	public static async decodeDropEntry(
		previousEntry: AuthorisedEntryWithPayload,
		provider: ByteProvider,
	): Promise<AuthorisedEntryWithPayload | null> {
		const headerByte = (await provider.read(1))[0];

		if (headerByte === 0x00) {
			return null;
		}

		if ((headerByte & 0b1100_0000) >> 6 !== 0b01) {
			throw new Error("Invalid header first 2 bits", { cause: headerByte.toString(2) });
		}

		const hasNamespaceId = !!(headerByte & 0b0010_0000);
		const hasSubspaceId = !!(headerByte & 0b0001_0000);

		if ((headerByte & 0b0000_0011) !== 0b01) {
			throw new Error("Invalid header last 2 bits", { cause: headerByte.toString(2) });
		}

		const namespaceId = hasNamespaceId
			? await NamespaceId.decode(provider)
			: previousEntry.namespaceId;
		const subspaceId = hasSubspaceId
			? await SubspaceId.decode(provider)
			: previousEntry.subspaceId;
		const path = await Path.decodePathRelativePath(previousEntry.path, provider, false);
		const timestamp = await UInt64.decodeVariable(headerByte, 2, 4, provider, false);
		const payloadLength = await UInt64.decodeVariable8(provider, false);
		const authorisationToken = await AuthorisationToken.decodeAuthorisationTokenRelative(
			{
				authorisedEntry: previousEntry,
				entry: {
					namespaceId,
					subspaceId,
					timestamp,
					path,
					payloadLength,
				},
			},
			provider,
		);
		const payloadDigest = await PayloadDigest.decode(provider);
		const payload = await provider.read(Number(payloadLength));

		const result: AuthorisedEntryWithPayload = {
			namespaceId,
			subspaceId,
			path,
			timestamp,
			payloadLength,
			payloadDigest,
			authorisationToken,
			payload,
		};

		if (!(await AuthorisedEntryWithPayload.isValid(result))) {
			throw new Error("Got invalid result", { cause: result });
		}

		return result;
	}

	public static decoder(): TransformStream<ByteString, AuthorisedEntryWithPayload> {
		let previousEntry = AuthorisedEntryWithPayload.default();
		let decodeEntryPromise: Promise<void> | undefined;

		async function decodeEntry(
			consume: (decodedEntry: AuthorisedEntryWithPayload) => void,
		): Promise<void> {
			const decodedEntry = await Drop.decodeDropEntry(previousEntry, byteProvider);

			if (decodedEntry === null) {
				byteProvider.endRead();
				return;
			}

			previousEntry = decodedEntry;
			consume(decodedEntry);

			decodeEntryPromise = undefined;
		}

		const byteProvider = new ByteProvider();
		return new TransformStream<ByteString, AuthorisedEntryWithPayload>({
			transform(chunk, controller) {
				if (decodeEntryPromise === undefined) {
					decodeEntryPromise = decodeEntry((entry) => controller.enqueue(entry)).catch(
						(err) => controller.error(err),
					);
				}

				if (chunk.length === 0) {
					return;
				}

				byteProvider.write(chunk);
			},
			async flush(controller) {
				byteProvider.endWrite();
				if (decodeEntryPromise) {
					await decodeEntryPromise;
				}
				while (byteProvider.remainingBytes > 0) {
					try {
						await decodeEntry((entry) => controller.enqueue(entry));
					} catch (e) {
						controller.error(e);
					}
				}
			},
		});
	}
}

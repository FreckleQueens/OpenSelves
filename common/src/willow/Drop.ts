import { ByteString } from "./ByteString.js";
import { Entry } from "./Entry.js";
import { NamespaceId } from "./NamespaceId.js";
import { Path } from "./Path.js";
import { PayloadDigest } from "./PayloadDigest.js";
import { SubspaceId } from "./SubspaceId.js";
import { UInt64 } from "./UInt64.js";
import { AuthorisedEntryWithPayload } from "./extension/index.js";
import { AuthorisationToken, AuthorisedEntry } from "./meadowcap/index.js";

export type DropDecodeSingleStep = {
	name: string;
	consumedBytes: number;
	decode: (
		bytes: ByteString,
		decodedEntry: Partial<AuthorisedEntryWithPayload>,
	) => number | undefined;
	repeat?: number;
};
export type DropDecodeMultiStep = {
	name: string;
	steps: DropDecodeStep[];
};

export type DropDecodeStep = DropDecodeSingleStep | DropDecodeMultiStep;

/**
 * https://willowprotocol.org/specs/drop-format/index.html
 * TODO: setup unit tests against https://github.com/worm-blossom/willow_test_vectors
 * TODO: make every encode method in the whole package return a ByteString array (no useless concat operation)
 * TODO: make decode operations return Promise<DECODED_OBJECT> and take in some kind of bytestring provider
 *  -> this provider transparently consumes bytes. for header bytes, only consume a byte when arriving at the last bit
 */
export class Drop {
	public static encodeHeaderByte(previousEntry: Entry, entry: Entry) {
		const hasNamespaceId = !NamespaceId.equals(entry.namespaceId, previousEntry.namespaceId);
		const hasSubspaceId = !SubspaceId.equals(entry.subspaceId, previousEntry.subspaceId);
		const timestamp = UInt64.encodeToVariable(entry.timestamp, 2);

		const headerBits = [0, 1];
		headerBits.push(hasNamespaceId ? 1 : 0);
		headerBits.push(hasSubspaceId ? 1 : 0);
		headerBits.push(timestamp.tag >> 1);
		headerBits.push(timestamp.tag & 0b01);
		// Payload slice is one single bytestring: the raw payload
		headerBits.push(0, 1);
		const header = headerBits
			.reverse()
			.reduce(
				(previousValue, currentValue, index) => previousValue | (currentValue << index),
				0,
			);

		return {
			hasNamespaceId,
			hasSubspaceId,
			timestampAdditionalBytes: timestamp.additionalBytes,
			headerByte: new Uint8Array([header]),
		};
	}
	public static decodeHeaderByte(headerByte: ByteString) {
		const headerBitPairs = Array(4)
			.fill(0)
			.map((_, index) => (headerByte[0] >> (index * 2)) & 0b11)
			.reverse();
		if (headerBitPairs[0] !== 0b01) {
			throw new Error("Invalid header first 2 bits", { cause: headerBitPairs });
		}
		const hasNamespaceId = !!(headerBitPairs[1] & 0b10);
		const hasSubspaceId = !!(headerBitPairs[1] & 0b01);

		const timestampTag = headerBitPairs[2];
		const timestampAdditionalBytesLength = UInt64.decodeVariableBytesLength(timestampTag, 2);
		if (headerBitPairs[3] !== 0b01) {
			throw new Error("Invalid header last 2 bits", { cause: headerBitPairs });
		}
		return { hasNamespaceId, hasSubspaceId, timestampTag, timestampAdditionalBytesLength };
	}

	/**
	 * https://willowprotocol.org/specs/drop-format/index.html#drop_format_desc
	 */
	public static encoder(): TransformStream<AuthorisedEntryWithPayload, ByteString> {
		let previousEntry: AuthorisedEntry = AuthorisedEntry.default();

		return new TransformStream<AuthorisedEntryWithPayload, ByteString>({
			transform(entry, controller) {
				const { hasNamespaceId, hasSubspaceId, timestampAdditionalBytes, headerByte } =
					Drop.encodeHeaderByte(previousEntry, entry);

				controller.enqueue(headerByte);
				if (hasNamespaceId) {
					controller.enqueue(NamespaceId.encode(entry.namespaceId));
				}
				if (hasSubspaceId) {
					controller.enqueue(SubspaceId.encode(entry.subspaceId));
				}

				controller.enqueue(Path.encodePathRelativePath(entry.path, previousEntry.path));
				controller.enqueue(timestampAdditionalBytes);
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

	public static decodeDropEntry(
		previousEntry: AuthorisedEntryWithPayload,
		decodedEntry: Partial<AuthorisedEntryWithPayload>,
	): DropDecodeStep[] {
		const steps: DropDecodeStep[] = [];

		const namespaceIdStep: DropDecodeStep = {
			name: "namespaceIdStep",
			consumedBytes: 0,
			decode(bytes, decodedEntry) {
				if (bytes.length === 0) {
					decodedEntry.namespaceId = ByteString.copy(previousEntry.namespaceId);
					return;
				}

				decodedEntry.namespaceId = NamespaceId.decode(bytes).namespaceId;
			},
		};
		const subspaceIdStep: DropDecodeStep = {
			name: "subspaceIdStep",
			consumedBytes: 0,
			decode(bytes, decodedEntry) {
				if (bytes.length === 0) {
					decodedEntry.subspaceId = ByteString.copy(previousEntry.subspaceId);
					return;
				}

				const subspaceId = SubspaceId.decode(bytes).subspaceId;
				if (subspaceId.length !== SubspaceId.LENGTH) {
					throw new Error("Invalid subspaceId length");
				}
				decodedEntry.subspaceId = subspaceId;
			},
		};
		const timestampAdditionalBytesStep: DropDecodeStep = {
			name: "timestampAdditionalBytesStep",
			consumedBytes: 0,
			decode(bytes, decodedEntry) {
				decodedEntry.timestamp = UInt64.decodeVariableAdditionalBytes(bytes);
			},
		};

		// header or null byte
		steps.push({
			name: "header or null byte",
			consumedBytes: 1,
			decode(bytes, decodedEntry) {
				if (bytes[0] === 0x00) {
					return -1;
				}

				const {
					hasNamespaceId,
					hasSubspaceId,
					timestampTag,
					timestampAdditionalBytesLength,
				} = Drop.decodeHeaderByte(bytes);

				namespaceIdStep.consumedBytes = hasNamespaceId ? NamespaceId.LENGTH : 0;
				subspaceIdStep.consumedBytes = hasSubspaceId ? SubspaceId.LENGTH : 0;
				timestampAdditionalBytesStep.consumedBytes = timestampAdditionalBytesLength;

				if (timestampAdditionalBytesLength === 0) {
					decodedEntry.timestamp = BigInt(timestampTag);
				}

				if (!hasNamespaceId) {
					decodedEntry.namespaceId = previousEntry.namespaceId;
				}

				if (!hasSubspaceId) {
					decodedEntry.subspaceId = previousEntry.subspaceId;
				}
			},
		});

		steps.push(namespaceIdStep);
		steps.push(subspaceIdStep);

		// Path
		steps.push(
			...Path.decodePathRelativePath(
				() => previousEntry.path,
				(path) => (decodedEntry.path = path),
			),
		);

		steps.push(timestampAdditionalBytesStep);

		const decodePayloadStep: DropDecodeSingleStep = {
			name: "decodePayloadStep",
			consumedBytes: 0,
			decode(bytes, decodedEntry) {
				decodedEntry.payload = bytes;
			},
		};
		steps.push(
			...UInt64.decodeUint64Variable8((result) => {
				decodePayloadStep.consumedBytes = Number(result);
				decodedEntry.payloadLength = result;
			}),
		);

		const decodeAuthorisationTokenStep: DropDecodeMultiStep = {
			name: "decode authorisation token",
			steps: [],
		};
		steps.push(
			{
				name: "prepare entry for authorisation token decoding",
				consumedBytes: 0,
				decode(bytes, decodedEntry) {
					const entry = {
						...decodedEntry,
						payloadDigest: PayloadDigest.of(),
					};
					if (!Entry.is(entry)) {
						throw new Error("decodedEntry.entry not fully decoded", {
							cause: decodedEntry,
						});
					}

					const { payloadDigest, ...entryWithoutPayloadDigest } = entry;
					decodeAuthorisationTokenStep.steps =
						AuthorisationToken.decodeAuthorisationTokenRelative(
							{
								authorisedEntry: previousEntry,
								entry: entryWithoutPayloadDigest,
							},
							(result) => {
								decodedEntry.authorisationToken = result;
							},
						);
				},
			},
			decodeAuthorisationTokenStep,
		);

		steps.push({
			name: "decode payload digest",
			consumedBytes: PayloadDigest.LENGTH,
			decode(bytes, decodedEntry) {
				decodedEntry.payloadDigest = PayloadDigest.decode(bytes);
			},
		});

		steps.push(decodePayloadStep);

		return steps;
	}

	public static async decoder(): Promise<
		TransformStream<ByteString, AuthorisedEntryWithPayload>
	> {
		let decodedEntry: Partial<AuthorisedEntryWithPayload> = {};
		let decodeEntrySteps: DropDecodeStep[] = Drop.decodeDropEntry(
			AuthorisedEntryWithPayload.default(),
			decodedEntry,
		);
		const stepStack: DropDecodeStep[] = [];
		let currentStep: DropDecodeStep;

		let stepBytes: ByteString;
		let stepBytesIndex: number;

		async function advance() {
			let returnEntry: AuthorisedEntryWithPayload | undefined;
			if (stepStack.length === 0) {
				if (decodeEntrySteps.length === 0) {
					const finalEntry = decodedEntry;
					if (
						!AuthorisedEntryWithPayload.is(finalEntry) ||
						!(await AuthorisedEntryWithPayload.isValid(finalEntry))
					) {
						throw new Error("Got invalid entry");
					}
					returnEntry = finalEntry;

					decodedEntry = {};
					decodeEntrySteps = Drop.decodeDropEntry(finalEntry, decodedEntry);
				}

				stepStack.push(decodeEntrySteps[0]);
				decodeEntrySteps.splice(0, 1);
			}

			currentStep = stepStack[stepStack.length - 1];
			stepStack.splice(stepStack.length - 1, 1);
			stepBytes = new Uint8Array(currentStep["consumedBytes"] || 0);
			stepBytesIndex = 0;

			if ("steps" in currentStep) {
				stepStack.push(...currentStep.steps.reverse());
			}

			return returnEntry;
		}
		await advance();

		async function decode(): Promise<AuthorisedEntryWithPayload | "end" | void> {
			if (!("steps" in currentStep)) {
				const decodeResult = currentStep.decode(stepBytes, decodedEntry);
				if (typeof decodeResult === "number") {
					if (decodeResult === -1) {
						return "end";
					}

					const nextStep = stepStack[stepStack.length - 1] || decodeEntrySteps[0];
					if (!nextStep || "steps" in nextStep) {
						throw new Error(
							"Tried to set consumedBytes of missing or invalid next step",
							{
								cause: {
									currentStep: currentStep.name,
									nextStep: nextStep?.name,
									remaining: decodeEntrySteps.length,
								},
							},
						);
					}
					nextStep.consumedBytes = decodeResult;
				}
			}

			return advance();
		}

		return new TransformStream<ByteString, AuthorisedEntryWithPayload>({
			async transform(chunk, controller) {
				if (chunk.length === 0) {
					return;
				}

				for (let i = 0; i < chunk.length; ) {
					const consumedBytes =
						"consumedBytes" in currentStep ? currentStep.consumedBytes : 0;
					const maxBytes = consumedBytes - stepBytesIndex;
					const sliceEnd = Math.min(i + maxBytes, chunk.length);
					const slice = chunk.slice(i, sliceEnd);
					stepBytes.set(slice, stepBytesIndex);

					i += slice.length;
					stepBytesIndex += slice.length;

					if (stepBytesIndex === consumedBytes) {
						const result = await decode();
						if (result === "end") {
							return;
						} else if (result) {
							controller.enqueue(result);
						}
					}
				}
			},
		});
	}
}

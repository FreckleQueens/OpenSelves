import assert from "node:assert";
import test, { describe } from "node:test";

import {
	AuthorisationToken,
	AuthorisedEntry,
	ByteString,
	Capability,
	CapabilityAccessMode,
	Ed25519,
	Entry,
	NamespaceId,
	OPENSELVES_NAMESPACE_ID,
	Path,
	PayloadDigest,
	Timestamp,
} from "../src/willow/index.js";

describe("willow non-standard codecs", () => {
	test("AuthorisationToken.encodeAuthorisationTokenEntryRelative", async () => {
		const keys = await Ed25519.generateKey();
		const payload = ByteString.fromUtf8("a payload");
		const entry: Entry = {
			namespaceId: OPENSELVES_NAMESPACE_ID,
			subspaceId: keys.publicKey,
			path: Path.fromStrings("a", "path"),
			timestamp: Timestamp.now(),
			payloadLength: BigInt(payload.length),
			payloadDigest: await PayloadDigest.hash(payload),
		};

		const authorisedEntry = await AuthorisedEntry.signEntry(entry, keys);
		const expectedAuthorisationToken = authorisedEntry.authorisationToken;
		const encoded = AuthorisationToken.encodeAuthorisationTokenEntryRelative(
			expectedAuthorisationToken,
			entry,
		);
		const decoded = AuthorisationToken.decodeAuthorisationTokenEntryRelative(encoded, entry);

		assert.deepStrictEqual(decoded.authorisationToken, expectedAuthorisationToken);
		assert.deepStrictEqual(decoded.consumedBytes, encoded.length);
	});

	test("Capability.encode simple", async () => {
		const namespace = await NamespaceId.generateRandomCommunalNamespaceKeys();
		const subspace = await Ed25519.generateKey();
		const expectedCap = Capability.create(
			CapabilityAccessMode.READ,
			namespace.publicKey,
			subspace.publicKey,
			[],
		);

		const encodedCap = Capability.encode(expectedCap);
		const { capability: decodedCap, consumedBytes } = Capability.decode(encodedCap);
		assert.deepStrictEqual(decodedCap, expectedCap);
		assert.strictEqual(consumedBytes, encodedCap.length);
	});

	test("Capability.encode delegations", async () => {
		const namespace = await NamespaceId.generateRandomCommunalNamespaceKeys();
		const subspace = await Ed25519.generateKey();
		const receiver = await Ed25519.generateKey();
		const expectedCap = await Capability.delegateCapability(
			CapabilityAccessMode.READ,
			namespace.publicKey,
			subspace.publicKey,
			subspace,
			receiver.publicKey,
		);

		const encodedCap = Capability.encode(expectedCap);
		const { capability: decodedCap, consumedBytes } = Capability.decode(encodedCap);
		assert.deepStrictEqual(decodedCap, expectedCap);
		assert.strictEqual(consumedBytes, encodedCap.length);
	});
});

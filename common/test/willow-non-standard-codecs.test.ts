import assert from "node:assert";
import test, { describe } from "node:test";

import { OPENSELVES_NAMESPACE_ID } from "../src/index.js";
import {
	AuthorisationToken,
	AuthorisedEntry,
	ByteProvider,
	ByteString,
	Capability,
	CapabilityAccessMode,
	Ed25519,
	Entry,
	NamespaceId,
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
		const provider = ByteProvider.of(encoded);
		const decoded = await AuthorisationToken.decodeAuthorisationTokenEntryRelative(
			entry,
			provider,
			false,
		);

		assert.deepStrictEqual(decoded, expectedAuthorisationToken);
		provider.endRead();
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
		const provider = ByteProvider.of(encodedCap);
		const decodedCap = await Capability.decode(provider, false);
		assert.deepStrictEqual(decodedCap, expectedCap);
		provider.endRead();
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
		const provider = ByteProvider.of(encodedCap);
		const decodedCap = await Capability.decode(provider, false);
		assert.deepStrictEqual(decodedCap, expectedCap);
		provider.endRead();
	});
});

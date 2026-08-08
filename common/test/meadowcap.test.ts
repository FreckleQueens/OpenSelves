import { createId } from "@paralleldrive/cuid2";
import assert from "node:assert";
import { beforeEach, describe } from "node:test";
import test from "node:test";

import {
	Area,
	AuthorisedEntry,
	AuthorisedEntryWithPayload,
	ByteString,
	Capability,
	CapabilitySignData,
	CommunalCapability,
	Ed25519,
	type Ed25519KeyPair,
	Entry,
	NamespaceId,
	Path,
	Timestamp,
} from "../src/willow/index.js";

// TODO: test owned namespace
describe("meadowcap", () => {
	describe("communal namespace", () => {
		let namespace: Ed25519KeyPair;

		beforeEach(async () => {
			namespace = await NamespaceId.generateRandomCommunalNamespaceKeys();
		});

		async function makeValidAuthorisedEntry(): Promise<{
			subspace: Ed25519KeyPair;
			authorisedEntry: AuthorisedEntry;
		}> {
			const subspace = await Ed25519.generateKey();
			const payload = ByteString.fromUtf8("a payload");
			return {
				subspace,
				authorisedEntry: await AuthorisedEntryWithPayload.create(
					namespace.publicKey,
					subspace.publicKey,
					Path.fromString("/a/path"),
					Timestamp.now(),
					payload,
					subspace,
				),
			};
		}

		async function makeValidDelegatedAuthorisedEntry(): Promise<{
			subspace: Ed25519KeyPair;
			receiver: Ed25519KeyPair;
			authorisedEntry: AuthorisedEntry;
			newAuthorisedEntry: AuthorisedEntry;
		}> {
			const { subspace, authorisedEntry } = await makeValidAuthorisedEntry();
			assert.strictEqual(await AuthorisedEntry.isAuthorisedWrite(authorisedEntry), true);

			const receiver = await Ed25519.generateKey();
			const newCap = await CommunalCapability.delegate(
				authorisedEntry.authorisationToken.capability.inner,
				Area.ofSubspace(subspace.publicKey),
				receiver.publicKey,
				subspace.secretKey,
				true,
			);
			const newEntry = await Entry.setPayload(
				authorisedEntry,
				ByteString.fromUtf8("new payload!"),
			);
			const newAuthorisedEntry = await AuthorisedEntry.signEntry(
				newEntry,
				CapabilitySignData.fromCapability(receiver.secretKey, newCap),
			);
			return {
				subspace,
				receiver,
				authorisedEntry,
				newAuthorisedEntry,
			};
		}

		test("Control: isAuthorisedWrite returns true with valid authorisation", async () => {
			const { authorisedEntry } = await makeValidAuthorisedEntry();
			assert.strictEqual(await AuthorisedEntry.isAuthorisedWrite(authorisedEntry), true);
		});

		test("isAuthorisedWrite returns false with signature of entry with the wrong payload", async () => {
			const { subspace, authorisedEntry } = await makeValidAuthorisedEntry();
			const wrongPayload = ByteString.fromUtf8("wrong payload");
			const wrongPayloadEntry = await Entry.setPayload(authorisedEntry, wrongPayload, {
				timestamp: null,
			});
			authorisedEntry.authorisationToken.signature = await Ed25519.sign(
				subspace.secretKey,
				Entry.encodeEntry(wrongPayloadEntry),
			);
			assert.strictEqual(await AuthorisedEntry.isAuthorisedWrite(authorisedEntry), false);
		});

		test("Control: isAuthorisedWrite returns true with one valid delegation", async () => {
			const { newAuthorisedEntry } = await makeValidDelegatedAuthorisedEntry();
			assert.strictEqual(await AuthorisedEntry.isAuthorisedWrite(newAuthorisedEntry), true);
		});

		test("isAuthorisedWrite returns false with receiver-forged delegation", async () => {
			const { subspace, authorisedEntry, receiver, newAuthorisedEntry } =
				await makeValidDelegatedAuthorisedEntry();
			const invalidDelegationAuthorisedEntry = AuthorisedEntry.copy(newAuthorisedEntry);

			const forgedDelegation =
				invalidDelegationAuthorisedEntry.authorisationToken.capability.inner.delegations[0];
			forgedDelegation.userSignature = await Ed25519.sign(
				receiver.secretKey,
				CommunalCapability.getHandoverPayload(
					authorisedEntry.authorisationToken.capability.inner,
					forgedDelegation.area,
					receiver.publicKey,
				),
			);
			assert.strictEqual(
				await AuthorisedEntry.isAuthorisedWrite(invalidDelegationAuthorisedEntry),
				false,
			);

			// However, a valid signature from subspace owner works
			forgedDelegation.userSignature = await Ed25519.sign(
				subspace.secretKey,
				CommunalCapability.getHandoverPayload(
					authorisedEntry.authorisationToken.capability.inner,
					forgedDelegation.area,
					receiver.publicKey,
				),
			);
			const nowValidAuthorisedEntry = invalidDelegationAuthorisedEntry;
			assert.strictEqual(
				await AuthorisedEntry.isAuthorisedWrite(nowValidAuthorisedEntry),
				true,
			);
		});

		test("Control: isAuthorisedWrite returns true with many valid delegations", async () => {
			const { subspace, authorisedEntry } = await makeValidAuthorisedEntry();
			let newAuthorisedEntry = authorisedEntry;
			let previousReceiver = subspace;
			for (let i = 0; i < 10; i++) {
				const newReceiver = await Ed25519.generateKey();
				const newEntry = await Entry.setPayload(
					newAuthorisedEntry,
					ByteString.fromUtf8(createId()),
				);
				const previousCap = newAuthorisedEntry.authorisationToken.capability;
				const newCap = await CommunalCapability.delegate(
					previousCap.inner,
					Capability.getGrantedArea(previousCap),
					newReceiver.publicKey,
					previousReceiver.secretKey,
					true,
				);
				newAuthorisedEntry = await AuthorisedEntry.signEntry(
					newEntry,
					CapabilitySignData.fromCapability(newReceiver.secretKey, newCap),
				);
				assert.strictEqual(
					await AuthorisedEntry.isAuthorisedWrite(newAuthorisedEntry),
					true,
				);

				previousReceiver = newReceiver;
			}

			assert(AuthorisedEntry.is(newAuthorisedEntry));
			assert.strictEqual(
				newAuthorisedEntry.authorisationToken.capability.inner.delegations.length,
				10,
			);
			assert(await AuthorisedEntry.isValid(newAuthorisedEntry));
		});
	});
});

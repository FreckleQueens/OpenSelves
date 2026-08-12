import { type MemberStatic, Payload } from "openselves-common/client";
import { ByteString } from "openselves-common/willow";

export function getMemberImageUrl(inState: { member?: MemberStatic }) {
	const state: {
		url?: string;
	} = $state({});
	let decodedValue: Blob | ByteString | undefined;

	$effect(() => {
		if (inState.member?.image) {
			let imageContents: ByteString;
			try {
				imageContents = ByteString.fromBase64(inState.member.image);
			} catch {
				state.url = undefined;
				return;
			}

			decodedValue = Payload.decodeByteStringOrBlob(imageContents);
			if (decodedValue instanceof Blob) {
				state.url = URL.createObjectURL(decodedValue);
			} else {
				state.url = ByteString.toUtf8(decodedValue);
			}
		} else {
			state.url = undefined;
		}

		return () => {
			if (state.url) {
				URL.revokeObjectURL(state.url);
			}
		};
	});
	return () => state;
}

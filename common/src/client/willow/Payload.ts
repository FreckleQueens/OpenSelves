import { ByteProvider } from "../../willow/ByteProvider.js";
import { ByteString, UInt64 } from "../../willow/index.js";

export class Payload extends ByteString {
	public static async encodeByteStringOrBlob(val: ByteString | Blob): Promise<Payload> {
		let headerByte = 0b0000_0000;
		const isBlob = val instanceof Blob;
		if (isBlob) {
			headerByte |= 0b1000_0000;
		}

		const parts: ByteString[] = [];
		if (val instanceof Blob) {
			const type = ByteString.fromUtf8(val.type);
			const { headerByte: newHeaderByte, additionalBytes } = UInt64.encodeVariable(
				BigInt(type.length),
				headerByte,
				7,
				1,
			);
			headerByte = newHeaderByte;
			parts.push(additionalBytes, type, await val.bytes());
		} else {
			parts.push(val);
		}
		return ByteString.concat(ByteString.of(headerByte), ...parts);
	}

	public static async decodeByteStringOrBlob(input: ByteString): Promise<ByteString | Blob> {
		const provider = ByteProvider.of(input);
		const headerByte = (await provider.read(1))[0];

		const isBlob = headerByte >> 7 === 0b1;
		let type: string = "";
		if (isBlob) {
			const typeLength = await UInt64.decodeVariable(headerByte, 7, 1, provider, false);
			type = ByteString.toUtf8(await provider.read(Number(typeLength)));
		}

		const content = await provider.read(provider.remainingBytes);
		provider.endRead();
		return isBlob
			? new Blob([content], {
					type,
				})
			: content;
	}
}

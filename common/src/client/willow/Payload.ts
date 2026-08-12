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

	public static decodeByteStringOrBlob(payload: Payload): ByteString | Blob {
		let consumedBytes = 0;
		const headerByte = payload[0];
		consumedBytes++;

		const isBlob = headerByte >> 7 === 0b1;
		if (isBlob) {
			const { value: typeLength, consumedBytes: typeLengthConsumedBytes } =
				UInt64.decodeVariable(headerByte, 7, 1, payload.slice(consumedBytes));
			consumedBytes += typeLengthConsumedBytes;

			const type = ByteString.toUtf8(
				payload.slice(consumedBytes, consumedBytes + Number(typeLength)),
			);
			consumedBytes += Number(typeLength);
			return new Blob([payload.slice(consumedBytes)], {
				type: type,
			});
		} else {
			return payload.slice(consumedBytes);
		}
	}
}

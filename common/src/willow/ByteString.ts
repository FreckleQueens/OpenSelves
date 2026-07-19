export class ByteString extends Uint8Array<ArrayBuffer> {
	private static textEncoder = new TextEncoder();
	private static textDecoder = new TextDecoder();

	public static fromUtf8(input: string): ByteString {
		return this.textEncoder.encode(input);
	}

	public static toUtf8(input: ByteString): string {
		return this.textDecoder.decode(input);
	}

	public static is(value: unknown): value is ByteString {
		return value instanceof Uint8Array && value.buffer instanceof ArrayBuffer;
	}

	public static equals(a: ByteString | undefined, b: ByteString | undefined) {
		if (a === undefined || b === undefined) {
			return a === b;
		}

		if (a.length !== b.length) {
			return false;
		}

		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) {
				return false;
			}
		}

		return true;
	}

	public static compare(a: ByteString, b: ByteString) {
		for (let i = 0; i < a.length && i < b.length; i++) {
			if (a[i] > b[i]) {
				return 1;
			}
			if (a[i] < b[i]) {
				return -1;
			}
		}

		return a.length > b.length ? 1 : a.length < b.length ? -1 : 0;
	}

	public static copy(byteString: ByteString): ByteString {
		return new Uint8Array(byteString);
	}

	public static concat(...parts: ByteString[]): ByteString {
		const output = new Uint8Array(
			parts.reduce((previousValue, currentValue) => {
				return previousValue + currentValue.byteLength;
			}, 0),
		);
		let cursor = 0;
		for (let i = 0; i < parts.length; i++) {
			output.set(parts[i], cursor);
			cursor += parts[i].byteLength;
		}
		return output;
	}
}

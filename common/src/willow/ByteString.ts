export type ByteStringOfLength<T extends number> = ByteString & {
	readonly length: T;
	readonly byteLength: T;
};

export class ByteString extends Uint8Array<ArrayBuffer> {
	public static readonly LENGTH: number | undefined = undefined;

	private static textEncoder = new TextEncoder();
	private static textDecoder = new TextDecoder();

	public static empty(): ByteStringOfLength<0> {
		return new Uint8Array(0) as ByteStringOfLength<0>;
	}

	public static of(...elements: number[]): ByteString {
		const output = Uint8Array.of(...elements);
		this.assertIs(output);
		return output;
	}

	public static fromUtf8(input: string): ByteString {
		const output = this.textEncoder.encode(input);
		this.assertIs(output);
		return output;
	}

	public static toUtf8(input: ByteString): string {
		return this.textDecoder.decode(input);
	}

	public static fromHex(input: string): ByteString {
		const output = Uint8Array.fromHex(input);
		this.assertIs(output);
		return output;
	}

	public static fromBase64(input: string): ByteString {
		const output = Uint8Array.fromBase64(input);
		this.assertIs(output);
		return output;
	}

	public static fromBuffer(value: ArrayBuffer): ByteString {
		const output = new Uint8Array(value);
		this.assertIs(output);
		return output;
	}

	public static is(value: unknown): value is ByteString;
	public static is<T extends number>(value: unknown, length: T): value is ByteStringOfLength<T>;
	public static is(value: unknown, length?: number): boolean {
		if (!(value instanceof Uint8Array && value.buffer instanceof ArrayBuffer)) {
			return false;
		}

		return length === undefined || (value.length === length && value.byteLength === length);
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

	private static assertIs(val: Uint8Array): void {
		if (!this.is(val)) {
			if (typeof this.LENGTH === "number" && val.byteLength !== this.LENGTH) {
				throw new Error("Invalid number of elements", {
					cause: {
						actual: val.byteLength,
						expected: this.LENGTH,
						val,
					},
				});
			} else {
				throw new Error("Invalid val", {
					cause: val,
				});
			}
		}
	}
}

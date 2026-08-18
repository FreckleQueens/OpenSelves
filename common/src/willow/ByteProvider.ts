import { ByteString } from "./ByteString.js";

type ReadRequest = {
	length: number;
	resolve: (value: ByteString) => void;
	reject: (err: unknown) => void;
};

export class InvalidInputError extends Error {}

export class ByteProvider {
	public static of(...parts: ByteString[]): ByteProvider {
		const provider = new ByteProvider();
		for (const bytes of parts) {
			provider.write(bytes);
		}
		provider.endWrite();
		return provider;
	}

	private readonly buffer: ByteString[] = [];
	private currentReadPart: ByteString | undefined;
	private currentReadPartCursor: number = 0;
	private writtenBytes: number = 0;
	private readBytes: number = 0;
	private readRequest: ReadRequest | undefined;
	private isWriteEnded: boolean = false;
	private isReadEnded: boolean = false;

	private stalledWriteTimeout: ReturnType<typeof setTimeout> | undefined;

	public constructor(private readonly timeout = 5000) {}

	public get remainingBytes(): number {
		return this.writtenBytes - this.readBytes;
	}

	public write(bytes: ByteString) {
		clearTimeout(this.stalledWriteTimeout);

		if (this.isWriteEnded) {
			throw new Error("Tried to write after write ended");
		}
		if (this.isReadEnded) {
			throw new Error("Tried to write after read ended");
		}

		this.buffer.push(bytes);
		this.writtenBytes += bytes.length;

		if (this.readRequest && this.remainingBytes >= this.readRequest.length) {
			this.fulfillReadRequest(this.readRequest);
			this.readRequest = undefined;
		}
	}

	public async read(length: number): Promise<ByteString> {
		if (this.isReadEnded) {
			throw new Error("Tried to read after read ended");
		}

		return new Promise<ByteString>((resolve, reject) => {
			const readRequest = {
				length,
				resolve,
				reject,
			};

			if (this.remainingBytes >= length) {
				this.fulfillReadRequest(readRequest);
			} else if (this.isWriteEnded) {
				reject(
					new InvalidInputError(
						"Write is closed and not enough bytes remaining for read request",
						{
							cause: {
								req: length,
								remaining: this.remainingBytes,
							},
						},
					),
				);
			} else {
				this.readRequest = readRequest;
				this.stalledWriteTimeout = setTimeout(() => {
					readRequest.reject(new Error("No bytes were written before timeout."));
				}, this.timeout);
			}
		});
	}

	private fulfillReadRequest(req: ReadRequest): void {
		if (this.isReadEnded) {
			throw new Error("Tried to read (async) after read ended");
		}

		if (this.remainingBytes < req.length) {
			req.reject(
				new Error(
					"Tried to read " +
						req.length +
						" bytes with only " +
						this.remainingBytes +
						" bytes remaining.",
				),
			);
			return;
		}

		const outputParts: ByteString[] = [];
		let consumedBytes = 0;
		while (consumedBytes < req.length) {
			if (!this.currentReadPart) {
				this.currentReadPart = this.buffer.splice(0, 1).at(0);
				this.currentReadPartCursor = 0;

				if (!this.currentReadPart) {
					throw new Error("Buffer didn't return an expected ByteString");
				}
			}

			const bytesToRead = Math.min(
				this.currentReadPart.length - this.currentReadPartCursor,
				req.length - consumedBytes,
			);
			outputParts.push(
				this.currentReadPart.slice(
					this.currentReadPartCursor,
					this.currentReadPartCursor + bytesToRead,
				),
			);
			this.currentReadPartCursor += bytesToRead;
			consumedBytes += bytesToRead;
			this.readBytes += bytesToRead;

			if (this.currentReadPartCursor === this.currentReadPart.length) {
				this.currentReadPart = undefined;
			}
		}
		req.resolve(ByteString.concat(...outputParts));
	}

	public endWrite() {
		if (this.isWriteEnded) {
			throw new Error("Write is already ended");
		}

		this.isWriteEnded = true;
		if (this.readRequest) {
			this.readRequest.reject(
				new InvalidInputError(
					"Write was closed before providing enough bytes to fulfill request for " +
						this.readRequest.length +
						" bytes.",
				),
			);
			throw new Error("Unexpected end of input");
		}
	}

	public endRead() {
		if (this.isReadEnded) {
			throw new Error("Read is already ended");
		}

		this.isReadEnded = true;
		if (this.remainingBytes > 0) {
			throw new InvalidInputError("Not all bytes where read", {
				cause: {
					remaining: this.remainingBytes,
					written: this.writtenBytes,
					read: this.readBytes,
				},
			});
		}
	}
}

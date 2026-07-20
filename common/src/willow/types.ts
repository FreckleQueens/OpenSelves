export {};

declare global {
	interface BigIntConstructor {
		/**
		 * This is needed for {@link UInt64}
		 * See https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-bigint-constructor
		 */
		// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
		new (): BigInt;
	}
}

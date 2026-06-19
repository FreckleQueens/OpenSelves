export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type ArrayElement<ArrayType extends readonly unknown[]> =
	ArrayType extends readonly (infer ElementType)[] ? ElementType : never;
export type KeysMatching<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];

export type JSONPrimitive = string | number | boolean | null | undefined;

export type JSONValue =
	| JSONPrimitive
	| JSONValue[]
	| {
			[key: string]: JSONValue;
	  };

export type JSONCompatible<T> = unknown extends T
	? never
	: {
			[P in keyof T]: T[P] extends JSONValue
				? T[P]
				: T[P] extends NotAssignableToJson
					? never
					: JSONCompatible<T[P]>;
		};

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export type NotAssignableToJson = bigint | symbol | Function;

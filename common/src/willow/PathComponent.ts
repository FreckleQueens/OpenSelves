import { ByteString } from "./ByteString.js";

export class PathComponent extends ByteString {
	public static fromString(input: string): PathComponent {
		return ByteString.fromUtf8(input);
	}

	public static toString(input: PathComponent): string {
		return ByteString.toUtf8(input);
	}
}

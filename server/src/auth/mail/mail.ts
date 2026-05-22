export interface IMail {
	readonly to: string;
	readonly from: string;
	readonly fromName: string;
	readonly subject: string;
	getBody(): Promise<string>;
}

export class Mail implements IMail {
	constructor(
		public readonly to: string,
		public readonly from: string,
		public readonly fromName: string,
		public readonly subject: string,
		private readonly body: string,
	) {}

	public getBody(): Promise<string> {
		return Promise.resolve(this.body);
	}
}

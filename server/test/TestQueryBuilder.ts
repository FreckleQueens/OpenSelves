import assert from "node:assert";

export const Methods: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type UserAuthData = {
	cookies: string;
};

export type CookieData = {
	name: string;
	not?: boolean;
	value?: string;
	options?: Record<string, string | boolean>;
};

export class TestQueryBuilder {
	private urlOrPath: string = "/";
	private method: Method = "GET";
	private readonly headers: Headers = new Headers();
	private body: string | ReadableStream<Uint8Array<ArrayBuffer>> | null = null;

	private expectStatus: number | undefined;
	private readonly expectHeaders: Headers = new Headers();
	private readonly expectCookies: CookieData[] = [];

	public constructor(protected readonly urlBase: string) {}

	public setUrlAndMethod(urlOrPath: string, method: Method): this {
		this.urlOrPath = urlOrPath;
		this.method = method;
		return this;
	}

	public get(urlOrPath: string): this {
		return this.setUrlAndMethod(urlOrPath, "GET");
	}

	public post(urlOrPath: string): this {
		return this.setUrlAndMethod(urlOrPath, "POST");
	}

	public put(urlOrPath: string): this {
		return this.setUrlAndMethod(urlOrPath, "PUT");
	}

	public patch(urlOrPath: string): this {
		return this.setUrlAndMethod(urlOrPath, "PATCH");
	}

	public delete(urlOrPath: string): this {
		return this.setUrlAndMethod(urlOrPath, "DELETE");
	}

	public set(headerName: string, value: string): this {
		this.headers.set(headerName, value);
		return this;
	}

	public accept(contentType: string, expectSameResponseContentType: boolean = true): this {
		const accept = this.set("Accept", contentType);
		return expectSameResponseContentType
			? accept.expectHeader("Content-Type", contentType)
			: accept;
	}

	public cookies(cookies: string) {
		return this.set("Cookie", cookies);
	}

	public authenticated(user: UserAuthData) {
		return this.cookies(user.cookies);
	}

	public setBody(body: string | ReadableStream<Uint8Array<ArrayBuffer>> | null): this {
		this.body = body;
		return this;
	}

	public send(body: object): this {
		return this.set("Content-Type", "application/json").setBody(JSON.stringify(body));
	}

	public uploadStream(readable: ReadableStream<Uint8Array<ArrayBuffer>>): this {
		return this.set("Content-Type", "application/octet-stream").setBody(readable);
	}

	public expectHeader(name: string, value: string): this {
		this.expectHeaders.set(name, value);
		return this;
	}

	public expect(status: number): this {
		this.expectStatus = status;
		return this;
	}

	public expectCookie(cookieData: CookieData): this {
		this.expectCookies.push(cookieData);
		return this;
	}

	public expectNotCookie(cookieName: string): this {
		this.expectCookies.push({
			name: cookieName,
			not: true,
		});
		return this;
	}

	public expectCookieDelete(cookieName: string): this {
		this.expectCookies.push({
			name: cookieName,
			options: { Expires: "Thu, 01 Jan 1970 00:00:00 GMT" },
		});
		return this;
	}

	public randomXForwardedFor(): this {
		const randomIp = Array(4)
			.fill(0)
			.map(() => Math.floor(Math.random() * 255).toString())
			.join(".");
		return this.set("X-Forwarded-For", randomIp);
	}

	public async execute(): Promise<Response> {
		if (this.urlOrPath === undefined) {
			throw new Error("url was not set");
		}

		const url = this.urlOrPath.startsWith("/") ? this.urlBase + this.urlOrPath : this.urlOrPath;

		const requestInit: RequestInit = {
			method: this.method,
			headers: this.headers,
			body: this.body,
		};

		if (requestInit.body instanceof ReadableStream) {
			requestInit["duplex"] = "half";
		}

		const response = await fetch(url, requestInit);

		try {
			if (this.expectStatus !== undefined) {
				assert.strictEqual(response.status, this.expectStatus);
			}

			for (const [name, value] of this.expectHeaders.entries()) {
				assert.strictEqual(response.headers.get(name), value);
			}

			const setCookie = Object.fromEntries(
				response.headers.getSetCookie().map((val) => {
					const parts = val.split("; ");
					const [name, value] = parts[0].split("=");
					const params = parts.slice(1);
					return [
						name,
						{
							value: val.split("=").length === 1 ? undefined : value,
							options: Object.fromEntries(
								params.map((param): [string, string | true] => {
									const [name, value] = param.split("=");
									return [name, value === undefined ? true : value];
								}),
							),
						},
					];
				}),
			);
			for (const expectCookie of this.expectCookies) {
				const cookie = setCookie[expectCookie.name];
				if (expectCookie.not) {
					assert(!cookie);
				} else {
					assert(cookie);
					if (expectCookie.value !== undefined) {
						assert.strictEqual(cookie.value, expectCookie.value);
					}

					if (expectCookie.options) {
						for (const [name, value] of Object.entries(expectCookie.options)) {
							const actualOption = cookie.options[name];
							if (!actualOption) {
								throw new Error(
									"Cookie " + expectCookie.name + " doesn't have option " + name,
									{
										cause: cookie,
									},
								);
							}

							if (actualOption !== value) {
								throw new Error(
									"Cookie " +
										expectCookie.name +
										"'s " +
										name +
										" option has wrong value. expected: " +
										value +
										"; got: " +
										actualOption,
									{
										cause: cookie,
									},
								);
							}
						}
					}
				}
			}
		} catch (e) {
			// eslint-disable-next-line @typescript-eslint/only-throw-error
			throw {
				error: e,
				initialCause: e && e["cause"],
				responseBody: response.headers.get("Content-Type")?.startsWith("application/json")
					? await response.json()
					: await response.text(),
				responseHeaders: response.headers,
				responseCookies: response.headers.getSetCookie(),
			};
		}

		return response;
	}

	public async json(): Promise<{
		headers: Response["headers"];
		body: object;
	}> {
		const response = await this.expectHeader(
			"Content-Type",
			"application/json; charset=utf-8",
		).execute();
		const body: unknown = await response.json();
		assert(body);
		assert(typeof body === "object");
		return {
			headers: response.headers,
			body,
		};
	}
}

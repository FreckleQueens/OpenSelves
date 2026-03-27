import { type User } from "openselves-common/db";

export class AccessTokenPayload {
	constructor(public readonly user: Omit<User, "passwordHash">) {}
}

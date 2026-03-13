import { User } from "../../../generated/prisma/client";

export class AccessTokenPayload {
	public readonly user: Omit<User, "passwordHash">;
}

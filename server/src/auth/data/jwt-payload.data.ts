import { User } from "../../generated/prisma/client";

export class JwtPayload {
	public readonly user: Omit<User, "passwordHash">;
}

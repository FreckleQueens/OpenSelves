import * as argon2 from "argon2";
import { Injectable } from "@nestjs/common";

import { User } from "../../generated/prisma/client";
import {
	UserCreateInput,
	UserUpdateInput,
	UserWhereUniqueInput,
} from "../../generated/prisma/models/User";
import { PrismaService } from "../../prisma.service";

@Injectable()
export class UserService {
	constructor(private readonly prisma: PrismaService) {}

	async user(where: UserWhereUniqueInput) {
		return this.prisma.user.findUnique({ where });
	}

	async userWithPasswordHash(where: UserWhereUniqueInput) {
		return this.prisma.user.findUnique({ where, omit: { passwordHash: false } });
	}

	async createUser(data: UserCreateInput): Promise<User> {
		return this.prisma.user.create({
			data,
		});
	}

	async updateUser(where: UserWhereUniqueInput, data: UserUpdateInput): Promise<User> {
		return this.prisma.user.update({ where, data });
	}

	async deleteUser(where: UserWhereUniqueInput) {
		return this.prisma.user.delete({ where });
	}

	public async hashPassword(password: string) {
		return argon2.hash(password);
	}

	public async verifyPassword(user: User, password: string) {
		if (!user.passwordHash) {
			throw new Error("user param doesn't have passwordHash field");
		}
		return await argon2.verify(user.passwordHash, password);
	}
}

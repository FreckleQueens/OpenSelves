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
	constructor(private readonly prismaService: PrismaService) {}

	async user(
		where: UserWhereUniqueInput,
		options: { withPasswordHash: boolean; withRelations?: Array<"refreshTokens"> } = {
			withPasswordHash: false,
		},
	) {
		const include = {};
		if (options.withRelations) {
			for (const relation of options.withRelations) {
				include[relation] = true;
			}
		}
		return this.prismaService.user.findUnique({
			where,
			include,
			omit: { passwordHash: !options.withPasswordHash },
		});
	}

	async createUser(data: UserCreateInput): Promise<User> {
		return this.prismaService.user.create({
			data,
		});
	}

	async updateUser(where: UserWhereUniqueInput, data: UserUpdateInput): Promise<User> {
		return this.prismaService.user.update({ where, data });
	}

	async deleteUser(where: UserWhereUniqueInput) {
		return this.prismaService.user.delete({ where });
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

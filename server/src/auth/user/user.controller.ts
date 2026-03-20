import {
	Body,
	Controller,
	Delete,
	Get,
	NotFoundException,
	Param,
	Patch,
	Post,
	Req,
	UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { User } from "../../generated/prisma/client";
import { UserUpdateInput } from "../../generated/prisma/models/User";
import { Public } from "../decorators/public.decorator";
import { CreateUserDto } from "./data/create-user.dto";
import { FindOneParams } from "./data/find-one.params";
import { UpdateUserDto } from "./data/update-user.dto";
import { UserService } from "./user.service";

@Controller("user")
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Get(":id")
	public async getUserById(@Req() request: Request, @Param() params: FindOneParams) {
		if (request.accessTokenPayload.user.id !== params.id) {
			throw new UnauthorizedException();
		}

		const user = await this.userService.user({ id: params.id });
		if (!user) {
			throw new NotFoundException("User not found");
		}
		return this.getUserResponseForOwner(user);
	}

	@Public({ allowAuthenticatedUsers: false })
	@Post("")
	public async createUser(@Body() createUserDto: CreateUserDto) {
		const hashedPassword = await this.userService.hashPassword(createUserDto.password);
		const createdUser = await this.userService.createUser({
			email: createUserDto.email,
			passwordHash: hashedPassword,
		});
		return this.getUserResponseForOwner(createdUser);
	}

	@Patch(":id")
	public async updateUser(
		@Req() request: Request,
		@Param() params: FindOneParams,
		@Body() updateUserDto: UpdateUserDto,
	): Promise<User> {
		if (request.accessTokenPayload.user.id !== params.id) {
			throw new UnauthorizedException();
		}

		const userWhere = { id: params.id };
		const user = await this.userService.user(userWhere, { withPasswordHash: true });
		if (!user) {
			throw new NotFoundException("User not found");
		}

		const patchData: UserUpdateInput = {};

		if (updateUserDto.email) {
			patchData.email = updateUserDto.email;
		}

		if (updateUserDto.newPassword) {
			if (
				!updateUserDto.oldPassword ||
				!(await this.userService.verifyPassword(user, updateUserDto.oldPassword))
			) {
				throw new UnauthorizedException("Invalid old password");
			}

			patchData.passwordHash = await this.userService.hashPassword(updateUserDto.newPassword);
		}

		return await this.userService.updateUser(userWhere, patchData);
	}

	@Delete(":id")
	public async deleteUser(@Req() request: Request, @Param() params: FindOneParams) {
		if (request.accessTokenPayload.user.id !== params.id) {
			throw new UnauthorizedException();
		}

		const user = await this.userService.deleteUser({ id: params.id });
		if (!user) {
			throw new NotFoundException("User not found");
		}
	}

	private getUserResponseForOwner(user: User) {
		return {
			id: user.id,
			email: user.email,
			createdAt: user.createdAt,
		};
	}
}

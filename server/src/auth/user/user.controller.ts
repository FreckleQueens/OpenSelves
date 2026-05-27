import {
	Body,
	ConflictException,
	Controller,
	Delete,
	Get,
	HttpCode,
	InternalServerErrorException,
	NotFoundException,
	Param,
	Patch,
	Post,
	Req,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DrizzleQueryError } from "drizzle-orm";
import type { Request } from "express";
import { type PartialBy } from "openselves-common";
import { type User } from "openselves-common/db";

import { type ConfigData } from "../../config.data.js";
import { Public } from "../decorators/public.decorator.js";
import { CreateUserDto } from "./data/create-user.dto.js";
import { FindOneParams } from "./data/find-one.params.js";
import { UpdateUserDto } from "./data/update-user.dto.js";
import { VerifyEmailParams } from "./data/verify-email.params.js";
import { UserService } from "./user.service.js";

@Controller("user")
export class UserController {
	constructor(
		private readonly configService: ConfigService<ConfigData>,
		private readonly userService: UserService,
	) {}

	@Get(":id")
	public async getUserById(@Req() request: Request, @Param() params: FindOneParams) {
		if (request.accessTokenPayload.user.id !== params.id) {
			throw new UnauthorizedException();
		}

		const user = await this.userService.getUser({ id: params.id });
		if (!user) {
			throw new NotFoundException("User not found");
		}
		return this.getUserResponseForOwner(user);
	}

	@Public({ allowAuthenticatedUsers: false })
	@Post("")
	public async createUser(@Body() createUserDto: CreateUserDto) {
		const expectedRegistrationPassword = this.configService.get("REGISTRATION_PASSWORD", {
			infer: true,
		});

		if (expectedRegistrationPassword) {
			if (!createUserDto.registrationPassword) {
				throw new UnauthorizedException("Missing registration password.");
			}

			if (createUserDto.registrationPassword !== expectedRegistrationPassword) {
				throw new UnauthorizedException("Wrong registration password.");
			}
		}

		const hashedPassword = await this.userService.hashPassword(createUserDto.password);
		let createdUser: User;
		try {
			createdUser = await this.userService.createUser({
				email: createUserDto.email,
				passwordHash: hashedPassword,
			});
		} catch (error) {
			if (error instanceof DrizzleQueryError && error.cause?.["code"] === "23505") {
				throw new ConflictException(
					{
						message: "User with this email address already exists.",
					},
					{ cause: error },
				);
			}
			throw error;
		}
		return this.getUserResponseForOwner(createdUser);
	}

	@Patch(":id")
	public async updateUser(
		@Req() request: Request,
		@Param() params: FindOneParams,
		@Body() updateUserDto: UpdateUserDto,
	) {
		if (request.accessTokenPayload.user.id !== params.id) {
			throw new UnauthorizedException();
		}

		const userId = params.id;
		const user = await this.userService.getUserWithPassword({ id: userId });
		if (!user) {
			throw new NotFoundException("User not found");
		}

		const patchData: Partial<User> = {};

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
		const updatedUser = await this.userService.updateUser(userId, patchData);
		if (!updatedUser) {
			throw new InternalServerErrorException(
				"User was updated but then couldn't be retrieved",
			);
		}
		return this.getUserResponseForOwner(updatedUser);
	}

	@Delete(":id")
	public async deleteUser(@Req() request: Request, @Param() params: FindOneParams) {
		if (request.accessTokenPayload.user.id !== params.id) {
			throw new UnauthorizedException();
		}

		const user = await this.userService.deleteUser(params.id);
		if (!user) {
			throw new NotFoundException("User not found");
		}
	}

	@Post(":id/verify-email/:token")
	@Public()
	@HttpCode(200)
	public async verifyEmail(@Param() params: VerifyEmailParams) {
		if (!(await this.userService.verifyUserEmail(params.id, params.token))) {
			throw new NotFoundException("User and/or token not found");
		}
		return {};
	}

	private getUserResponseForOwner(user: PartialBy<User, "passwordHash">) {
		return {
			id: user.id,
			email: user.email,
			createdAt: user.createdAt,
			isEmailVerified: user.isEmailVerified,
		};
	}
}

import {
	BadRequestException,
	Body,
	ConflictException,
	Controller,
	Delete,
	ForbiddenException,
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
import { Throttle } from "@nestjs/throttler";
import { DrizzleQueryError } from "drizzle-orm";
import type { Request } from "express";
import type { GetUserResult, PartialBy } from "openselves-common";
import type { ServerUserEmailChangeRequest, User } from "openselves-common/db";

import type { ConfigData } from "../../config.data.js";
import { Public } from "../decorators/public.decorator.js";
import { CreateUserDto } from "./data/create-user.dto.js";
import { FindOneParams } from "./data/find-one.params.js";
import { RecoverPasswordDto } from "./data/recover-password.dto.js";
import { SendPasswordRecoveryEmailDto } from "./data/send-password-recovery-email.dto.js";
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
		if (request.accessTokenPayload?.user.id !== params.id) {
			throw new UnauthorizedException();
		}

		const user = await this.userService.getUser(
			{ id: params.id },
			{
				emailChangeRequest: true,
			},
		);
		if (!user) {
			throw new NotFoundException("User not found");
		}
		return this.getUserResponseForOwner(user);
	}

	@Public({ allowAuthenticatedUsers: false })
	@Post("")
	public async createUser(@Req() request: Request, @Body() createUserDto: CreateUserDto) {
		this.requireCaptchaSendEmailAction(request, createUserDto.email);

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
		return this.getUserResponseForOwner({ ...createdUser, emailChangeRequest: null });
	}

	@Patch(":id")
	public async updateUser(
		@Req() request: Request,
		@Param() params: FindOneParams,
		@Body() updateUserDto: UpdateUserDto,
	) {
		if (!Object.values(updateUserDto).find((val) => !!val)) {
			throw new BadRequestException("At least one field is required");
		}

		if (request.accessTokenPayload?.user.id !== params.id) {
			throw new UnauthorizedException();
		}

		if (updateUserDto.email) {
			this.requireCaptchaSendEmailAction(request, updateUserDto.email);
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
		if (request.accessTokenPayload?.user.id !== params.id) {
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
		let result: boolean;
		try {
			result = await this.userService.verifyUserEmail(params.id, params.token);
		} catch (error) {
			if (error instanceof DrizzleQueryError && error.cause?.["code"] === "23505") {
				throw new ConflictException("That email address is already taken");
			} else {
				throw error;
			}
		}
		if (!result) {
			throw new NotFoundException("User and/or token not found");
		}
		return {};
	}

	@Post(":id/resend-verification-email")
	@HttpCode(200)
	@Throttle({
		default: {
			ttl: 15 * 60 * 1000, // 15min
			limit: 15,
		},
		user: {
			ttl: 15 * 60 * 1000, // 15min
			limit: 1,
		},
	})
	public async resendVerificationEmail(@Param() params: FindOneParams, @Req() request: Request) {
		const authenticatedUserId = request.accessTokenPayload?.user.id;
		if (params.id !== authenticatedUserId) {
			throw new ForbiddenException();
		}

		const user = await this.userService.getUser(
			{ id: authenticatedUserId },
			{
				emailChangeRequest: true,
			},
		);
		if (!user) {
			throw new NotFoundException("User not found");
		}

		const toEmail = this.userService.getUserEmailToVerify(user);
		this.requireCaptchaSendEmailAction(request, toEmail);

		await this.userService.resendVerificationEmail(user);
		return {};
	}

	@Post(":id/recover-password")
	@Public()
	@HttpCode(200)
	public async recoverPassword(
		@Param() params: FindOneParams,
		@Body() recoverPasswordDto: RecoverPasswordDto,
	) {
		if (
			!(await this.userService.recoverPassword(
				params.id,
				recoverPasswordDto.token,
				recoverPasswordDto.newPassword,
			))
		) {
			throw new NotFoundException("User and/or token not found");
		}
		return {};
	}

	@Post("recover-password")
	@HttpCode(200)
	@Public()
	@Throttle({
		default: {
			ttl: 15 * 60 * 1000, // 15min
			limit: 15,
		},
		email: {
			ttl: 15 * 60 * 1000, // 15min
			limit: 1,
		},
	})
	public async sendPasswordRecoveryEmail(
		@Req() request: Request,
		@Body() sendPasswordRecoveryEmailDto: SendPasswordRecoveryEmailDto,
	) {
		this.requireCaptchaSendEmailAction(request, sendPasswordRecoveryEmailDto.email);

		if (
			!(await this.userService.sendPasswordRecoveryEmail(sendPasswordRecoveryEmailDto.email))
		) {
			throw new NotFoundException("User not found with this email address.");
		}
		return {};
	}

	private getUserResponseForOwner(
		user: PartialBy<
			User & {
				emailChangeRequest: ServerUserEmailChangeRequest | null;
			},
			"passwordHash"
		>,
	): GetUserResult {
		const publicUrl = this.configService.getOrThrow("PUBLIC_URL", { infer: true });
		const domain = publicUrl.split("//", 2)[1]; // strip protocol part
		return {
			id: user.id,
			domain,
			email: user.email,
			createdAt: user.createdAt,
			isEmailVerified: user.isEmailVerified,
			newEmailRequest: user.emailChangeRequest?.email || "",
		};
	}

	private requireCaptchaSendEmailAction(request: Request, expectedEmail: string) {
		if (!request.sendEmailActionEmail) {
			throw new BadRequestException("Missing captcha sendEmail action");
		}

		if (request.sendEmailActionEmail !== expectedEmail) {
			throw new BadRequestException(
				"Captcha sendEmail action value does not match request email",
			);
		}
	}
}

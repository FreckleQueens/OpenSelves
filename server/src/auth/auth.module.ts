import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";

import { PrismaService } from "../prisma.service";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { UserController } from "./user/user.controller";
import { UserService } from "./user/user.service";

if (!process.env["JWT_SECRET"] || process.env["JWT_SECRET"] === "CHANGE_ME") {
	throw new Error(
		"JWT_SECRET environment variable not configured. Please set to secure random string.",
	);
}

@Module({
	imports: [
		JwtModule.register({
			global: true,
			secret: process.env["JWT_SECRET"],
			signOptions: { expiresIn: "60s" },
		}),
	],
	providers: [
		{
			provide: APP_GUARD,
			useClass: AuthGuard,
		},
		UserService,
		PrismaService,
	],
	controllers: [AuthController, UserController],
})
export class AuthModule {}

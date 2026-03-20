import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";

import { ConfigData } from "../config.data";
import { PrismaService } from "../prisma.service";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { SessionService } from "./session/session.service";
import { UserController } from "./user/user.controller";
import { UserService } from "./user/user.service";

@Module({
	imports: [
		JwtModule.registerAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService<ConfigData>) => {
				const jwtSecret = configService.getOrThrow("JWT_SECRET", { infer: true });
				if (!jwtSecret || jwtSecret === "CHANGE_ME") {
					throw new Error(
						"Please set JWT_SECRET environment variable to secure random string.",
					);
				}
				return {
					global: true,
					secret: jwtSecret,
					signOptions: {
						expiresIn: configService.getOrThrow("ACCESS_TOKEN_DURATION", {
							infer: true,
						}),
					},
				};
			},
		}),
	],
	providers: [
		PrismaService,
		{
			provide: APP_GUARD,
			useClass: AuthGuard,
		},
		UserService,
		SessionService,
	],
	controllers: [AuthController, UserController],
})
export class AuthModule {}

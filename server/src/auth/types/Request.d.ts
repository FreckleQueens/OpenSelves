import { JwtPayload } from "../data/jwt-payload.data";

declare global {
	declare namespace Express {
		export interface Request {
			jwtPayload: JwtPayload;
		}
	}
}

import { AccessTokenPayload } from "../session/data/access-token-payload.data";

declare global {
	declare namespace Express {
		export interface Request {
			accessTokenPayload: AccessTokenPayload;
		}
	}
}

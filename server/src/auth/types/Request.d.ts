import { AccessTokenPayload } from "../session/data/access-token-payload.data.js";

declare global {
	namespace Express {
		export interface Request {
			accessTokenPayload?: AccessTokenPayload;
		}
	}
}

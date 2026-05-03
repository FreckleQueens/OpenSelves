import rootPackage from "./generated/rootPackage.json" with { type: "json" };

export const TOKEN_EXPIRED_ERROR = "TokenExpiredError";
export const SESSION_EXPIRED_ERROR = "SessionExpiredError";

export const API_VERSION: string = rootPackage.version;

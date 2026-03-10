import { Reflector } from "@nestjs/core";

export class PublicAccessSettings {
	allowAuthenticatedUsers?: boolean = true;
}

/**
 * Allow unauthenticated users.
 */
export const Public = Reflector.createDecorator<PublicAccessSettings>();

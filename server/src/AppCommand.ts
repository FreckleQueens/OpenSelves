import type { INestApplication } from "@nestjs/common";
import { Command } from "commander";

export type CommandContext = {
	app: INestApplication;
};

export class AppCommand extends Command {
	declare readonly commands: readonly AppCommand[];
	private context?: CommandContext;

	public getContext() {
		if (!this.context) {
			throw new Error("Command context not set");
		}
		return this.context;
	}

	public setContext(context: CommandContext) {
		this.context = context;
		for (const command of this.commands) {
			command.setContext(context);
		}
	}

	public createCommand(name?: string): AppCommand {
		return new AppCommand(name);
	}
}

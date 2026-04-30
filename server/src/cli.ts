import type { INestApplication } from "@nestjs/common";
import { program } from "commander";

import { AppCommand } from "./AppCommand.js";

/**
 * @returns {Promise<boolean>} `true` if cli was handled, `false` if there was no cli arguments
 */
export async function handleCli(app: INestApplication): Promise<boolean> {
	if (process.argv.length <= 2) {
		return false;
	}

	const commands = app.get<AppCommand, AppCommand[]>(AppCommand);
	for (const command of commands) {
		program.addCommand(command);
		command.setContext({
			app,
		});
	}
	await program.parseAsync();
	await app.close();
	return true;
}

// @ts-check
import path from "node:path";
import { makeEslintConfig } from "openselves-common-ui/config";

import svelteConfig from "./svelte.config.js";

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

export default makeEslintConfig(gitignorePath, svelteConfig);

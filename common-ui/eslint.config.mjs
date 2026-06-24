// @ts-check
import path from "node:path";
import { makeEslintConfig, makeSvelteConfig } from "openselves-common-ui/config";

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

export default makeEslintConfig(gitignorePath, makeSvelteConfig());

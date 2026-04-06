import * as fs from "node:fs";
import type { Directive, Expression, Identifier, ModuleDeclaration, Statement } from "estree";
import MagicString from "magic-string";
import { resolve } from "path";
import { type AST, type PreprocessorGroup, parse } from "svelte/compiler";

// noinspection ES6PreferShortImport
import { DEFAULT_LOCALE, supportedLocales } from "../src/lib/i18n/i18n.ts";

export const i18nSveltePreprocessor: PreprocessorGroup = {
	async markup({ content }) {
		const ast = parse(content, { modern: true });
		const magicString = new MagicString(content);

		const i18nKeys: Set<string> = new Set();

		walk(ast, null, (node, parent) => {
			if (node.type === "CallExpression") {
				if (node.callee.type === "Identifier" && node.callee.name === "t") {
					const keyArg = node.arguments[0];
					if (keyArg.type !== "Literal") {
						throw new Error(
							"Only simple string literals are supported for translation",
						);
					}
					if (typeof keyArg.value !== "string") {
						throw new Error(
							"Only simple string literals are supported for translation",
						);
					}
					i18nKeys.add(keyArg.value);
				}
			}

			if (node.type === "Text" && parent && parent.type === "Fragment") {
				const textNode = node as AST.Text;
				const rawKey = textNode.data;
				const trimmedKey = rawKey.trim();
				if (trimmedKey.length > 0) {
					const key = trimmedKey.replaceAll(/[\n\t]/g, " ").replaceAll(/(  +)/g, " ");
					const start = /[ \t\n]/.test(rawKey[0]) ? " " : "";
					const end = /[ \t\n]/.test(rawKey[rawKey.length - 1]) ? " " : "";
					magicString.update(
						node.start,
						node.end,
						`${start}{t("${key.replaceAll(`"`, `\\"`)}")}${end}`,
					);
					i18nKeys.add(key);
				}
			}
		});

		checkKeysAreTranslated([...i18nKeys]);

		return {
			code: magicString.toString(),
			map: magicString.generateMap(),
		};
	},
};

type WalkNode =
	| AST.Fragment
	| AST.Script
	| AST.TemplateNode
	| Directive
	| Statement
	| ModuleDeclaration
	| Expression
	| Identifier;
function walk(
	node: WalkNode,
	parent: WalkNode | null,
	processNode: (node: WalkNode, parent: WalkNode | null) => void,
) {
	processNode(node, parent);

	function walkValue(value: unknown) {
		if (Array.isArray(value)) {
			value.forEach((val) => walkValue(val));
			return;
		}

		if (isWalkNode(value)) {
			walk(value, node, processNode);
		}
	}
	for (const value of Object.values(node)) {
		walkValue(value);
	}
}

function checkKeysAreTranslated(i18nKeys: string[]) {
	const translationDir = "src/lib/i18n/locales";
	const missingKeys: Record<string, string[]> = {};
	for (const locale of supportedLocales) {
		if (locale === DEFAULT_LOCALE) continue;

		const file = resolve(translationDir, locale + ".json");
		if (!fs.existsSync(file)) {
			throw new Error("Missing translation file " + file);
		}

		const fileContent = fs.readFileSync(file).toString();
		const localeData = JSON.parse(fileContent);

		if (typeof localeData !== "object") {
			throw new Error("Malformed translation file " + file);
		}

		for (const key of i18nKeys) {
			if (!Object.keys(localeData).find((k) => k === key)) {
				if (!missingKeys[locale]) {
					missingKeys[locale] = [];
				}
				missingKeys[locale].push(key);
			}
		}
	}
	if (Object.entries(missingKeys).length > 0) {
		console.error("\ni18n missing keys:");
		for (const [locale, keys] of Object.entries(missingKeys)) {
			console.warn(locale + ".json:");
			console.warn("{");
			for (const key of keys) {
				console.warn(`\t"${key.replaceAll(`"`, `\\"`)}": "",`);
			}
			console.warn("}");
		}
		throw new Error("Please update translation files and then rebuild");
	}
}

function isWalkNode(value: unknown): value is WalkNode {
	return (
		!!value && typeof value === "object" && "type" in value && typeof value.type === "string"
	);
}

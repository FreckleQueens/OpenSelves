import fr from "./locales/fr.json" with { type: "json" };

export const DEFAULT_LOCALE = "en";
export const supportedLocales = [DEFAULT_LOCALE, "fr"];

export const localeState: {
	locale: string | null;
} = {
	locale: null,
};

export const locales: Record<string, Record<string, string>> = {
	fr: fr,
};
for (const locale of supportedLocales) {
	if (locale === DEFAULT_LOCALE) continue;

	if (!locales[locale]) {
		throw new Error("Translation file not imported for " + locale);
	}
}

globalThis.t = function translate(key: string, ...args: string[]): string {
	const locale = localeState.locale;

	if (!locale) {
		throw new Error("Locale not set");
	}

	if (locale !== DEFAULT_LOCALE) {
		const localeMap = locales[locale];
		if (!localeMap) {
			throw new Error("Locale not found: " + locale);
		}

		const newValue = localeMap[key];
		if (!newValue) {
			throw new Error(`Key \`${key}\` not translated in locale ${locale}`);
		} else {
			key = newValue;
		}
	}

	let tags: string[] = [];
	const regexp = /\{.+?}/g;

	let tag: string | undefined;
	do {
		tag = regexp.exec(key)?.[0];
		if (tag) {
			tags.push(tag);
		}
	} while (tag);
	tags = Array.from(new Set(tags));

	for (let i = 0; i < tags.length; i++) {
		key = key.replace(tags[i], args[i]);
	}

	return key;
};

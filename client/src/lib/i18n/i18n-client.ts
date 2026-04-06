import { DEFAULT_LOCALE, localeState } from "$lib/i18n/i18n";
import { Storage } from "$lib/storage";

const LOCALE_STORAGE_KEY = "locale";
const storage = await Storage.getStorage();
await setLocale((await storage.get(LOCALE_STORAGE_KEY)) || DEFAULT_LOCALE, false);

export async function setLocale(newLocale: string, reload: boolean = true) {
	localeState.locale = newLocale;
	const storage = await Storage.getStorage();
	await storage.set(LOCALE_STORAGE_KEY, newLocale);
	if (reload) {
		window.location.reload();
	}
}

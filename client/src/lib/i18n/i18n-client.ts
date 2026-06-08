import { PersistentStorage } from "$lib/PersistentStorage";
import { localeState } from "$lib/i18n/i18n";

export const LOCALE_STORAGE_KEY = "locale";

export async function setLocale(newLocale: string, reload: boolean = true) {
	localeState.locale = newLocale;
	await PersistentStorage.getInstance().set(LOCALE_STORAGE_KEY, newLocale, true);
	if (reload) {
		window.location.reload();
	}
}

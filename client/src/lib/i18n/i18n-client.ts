import { PersistentStorage } from "$lib/PersistentStorage";
import { localeState } from "$lib/i18n/i18n";

export const LOCALE_STORAGE_KEY = "locale";

export async function setLocale(newLocale: string, reload: boolean = true) {
	localeState.locale = newLocale;
	await PersistentStorage.getInstance().setRaw(LOCALE_STORAGE_KEY, newLocale);
	if (reload) {
		window.location.reload();
	}
}

// Disables access to DOM typings like `HTMLElement` which are not available
// inside a service worker and instantiates the correct globals
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Ensures that the `$service-worker` import has proper type definitions
/// <reference types="@sveltejs/kit" />
// Only necessary if you have an import from `$env/static/public`
/// <reference types="../.svelte-kit/ambient.d.ts" />
import { build, files, version } from "$service-worker";

const self = globalThis.self as unknown as ServiceWorkerGlobalScope;
const CACHE = `cache-${version}`;
const ASSETS = [
	...build, // the app itself
	...files, // everything in `static`
];

self.addEventListener("install", (event) => {
	console.debug("install", CACHE, event);

	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(ASSETS);
		})(),
	);
});
self.addEventListener("activate", (event) => {
	console.debug("activate", CACHE, event);

	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
		})(),
	);
});
self.addEventListener("fetch", (event) => {
	console.debug("fetch", CACHE, event);

	if (event.request.method === "GET") {
		event.respondWith(
			(async () => {
				const url = new URL(event.request.url);
				const cache = await caches.open(CACHE);

				if (ASSETS.includes(url.pathname)) {
					const response = await cache.match(url.pathname);

					if (response) {
						return response;
					}
				}

				const response = await fetch(event.request);

				if (!(response instanceof Response)) {
					throw new Error("invalid response from fetch");
				}

				return response;
			})(),
		);
	}
});

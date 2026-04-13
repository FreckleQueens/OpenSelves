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

self.addEventListener("install", async (event) => {
	console.debug("install");

	event.waitUntil(
		(async () => {
			const cache = await self.caches.open(CACHE);
			await cache.addAll(ASSETS);
		})(),
	);

	await self.skipWaiting();
});
self.addEventListener("activate", (event) => {
	console.debug("activate");

	event.waitUntil(
		(async () => {
			for (const key of await self.caches.keys()) {
				if (key !== CACHE) await self.caches.delete(key);
			}
			await self.clients.claim();
		})(),
	);
});
self.addEventListener("fetch", (event) => {
	console.debug("fetch");

	if (event.request.method === "GET") {
		event.respondWith(
			(async () => {
				const url = new URL(event.request.url);
				const cache = await self.caches.open(CACHE);

				if (
					!["/service-worker.ts", "/manifest.json"].includes(url.pathname) &&
					ASSETS.includes(url.pathname)
				) {
					const response = await cache.match(url.pathname);
					console.debug("asset cache hit", url.pathname);

					if (response) {
						return response;
					}
				}

				try {
					const response = await fetch(event.request);

					if (!(response instanceof Response)) {
						throw new Error("invalid response from fetch");
					}

					if (response.status === 200) {
						console.log("new cache", url.pathname);
						await cache.put(event.request, response.clone());
					}

					return response;
				} catch (error) {
					const response = await cache.match(event.request);

					if (response) {
						console.log("fallback cache hit", url.pathname);
						return response;
					}

					throw error;
				}
			})(),
		);
	}
});

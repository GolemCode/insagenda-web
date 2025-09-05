const CACHE_NAME = 'insagenda-v1';
const APP_SHELL = [
	'./',
	'./index.html',
	'./styles.css',
	'./main.js',
	'./manifest.webmanifest',
	'./icons/icon-512.webp'
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => Promise.all(
			keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
		))
	);
});

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (event.request.method !== 'GET') return;
	// Network-first for ICS, cache-first for app shell
	if (url.pathname.endsWith('.ics')) {
		event.respondWith(
			fetch(event.request).then((res) => {
				const copy = res.clone();
				caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
				return res;
			}).catch(() => caches.match(event.request))
		);
		return;
	}
	event.respondWith(
		caches.match(event.request).then((cached) => cached || fetch(event.request))
	);
}); 
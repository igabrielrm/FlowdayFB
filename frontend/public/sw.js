const CACHE_SHELL = 'flowday-shell-v4';
const CACHE_ASSETS = 'flowday-assets-v4';
const CACHE_IMAGES = 'flowday-images-v4';

const PRECACHE = ['/app/', '/app/index.html', '/manifest.json'];

function isSpaNavigation(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  if (path.startsWith('/api/') || path.startsWith('/ws') || path.startsWith('/admin/reportes')) {
    return false;
  }
  return path === '/app' || path === '/app/' || path.startsWith('/app/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_SHELL && k !== CACHE_ASSETS && k !== CACHE_IMAGES)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function serveSpaShell() {
  const cached = await caches.match('/app/index.html');
  if (cached) return cached;
  try {
    const response = await fetch('/app/index.html');
    if (response.ok) {
      const cache = await caches.open(CACHE_SHELL);
      cache.put('/app/index.html', response.clone());
      return response;
    }
  } catch {
    /* offline */
  }
  return new Response('Offline — abre Flowday con conexión al menos una vez.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (
      cached ||
      new Response('', { status: 503, statusText: 'Offline' })
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || network || new Response('', { status: 503, statusText: 'Offline' });
}

function shouldBypass(url) {
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return true;
  if (url.pathname.startsWith('/@') || url.pathname.includes('/@vite/')) return true;
  if (url.pathname.includes('/node_modules/')) return true;
  if (url.search.includes('import')) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (shouldBypass(url)) return;

  if (event.request.mode === 'navigate' && isSpaNavigation(url)) {
    event.respondWith(serveSpaShell());
    return;
  }

  if (url.pathname.startsWith('/app/assets/')) {
    event.respondWith(cacheFirst(event.request, CACHE_ASSETS));
    return;
  }

  if (url.pathname.startsWith('/images/')) {
    event.respondWith(staleWhileRevalidate(event.request, CACHE_IMAGES));
    return;
  }

  if (url.pathname === '/manifest.json' || url.pathname === '/app/manifest.json') {
    event.respondWith(cacheFirst(event.request, CACHE_SHELL));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => response)
      .catch(async () => {
        const cached = await caches.match(event.request);
        return (
          cached ||
          new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
        );
      }),
  );
});

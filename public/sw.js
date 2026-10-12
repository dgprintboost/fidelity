// Service worker minimal : rend la carte installable et garde en cache les fichiers versionnés
// (/assets/*, dont le nom change à chaque build). Les pages HTML et les requêtes Firebase passent
// toujours par le réseau : les tampons affichés viennent de Firestore, jamais d'un cache.
// Le suffixe du nom de cache est remplacé au build (vite.config.js) : chaque mise en ligne purge l'ancien cache.
const CACHE = 'fidelity-assets-__BUILD_ID__'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  const isVersionedAsset =
    request.method === 'GET' && url.origin === self.location.origin && url.pathname.includes('/assets/')
  if (!isVersionedAsset) return

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) {
        // Un cache plein ne doit pas casser la page : on ignore l'échec et on sert la réponse réseau.
        event.waitUntil(cache.put(request, response.clone()).catch(() => {}))
      }
      return response
    }),
  )
})

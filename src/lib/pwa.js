// Carte installée sur l'écran d'accueil (Android ou iPhone).
export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
}

export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

// Uniquement au build : en dev, Vite sert les fichiers autrement et le cache gênerait.
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  // Échec silencieux : sans service worker, la carte fonctionne normalement (seule l'installation manque).
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
}

import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { browserLocalPersistence, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Cette configuration est publique par nature (elle part dans le navigateur).
// La sécurité repose sur firestore.rules, App Check et la restriction de la clé d'API au domaine github.io.
const env = import.meta.env

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

const required = {
  VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
  VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
  VITE_FIREBASE_APP_ID: firebaseConfig.appId,
  VITE_RECAPTCHA_SITE_KEY: env.VITE_RECAPTCHA_SITE_KEY,
}
const missing = Object.keys(required).filter((key) => !required[key])
if (missing.length) {
  throw new Error(`Configuration Firebase incomplète dans .env.local : ${missing.join(', ')}`)
}

// En local (dev et `vite preview`), App Check utilise un jeton de debug à enregistrer dans la console Firebase.
if (env.DEV || location.hostname === 'localhost') {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
}

export const app = initializeApp(firebaseConfig)

// App Check doit être initialisé avant toute requête vers Firestore ou Auth.
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(env.VITE_RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
})

// initializeAuth plutôt que getAuth : pas de popup ni de redirection dans ce projet, donc pas de
// popupRedirectResolver, qui chargerait apis.google.com et une iframe bloqués par la CSP sur mobile.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
})
export const db = getFirestore(app)

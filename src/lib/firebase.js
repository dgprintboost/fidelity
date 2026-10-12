import { initializeApp, setLogLevel } from 'firebase/app'
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

// La présence de ces variables est vérifiée par vite.config.js (dev, build et preview échouent sinon) :
// aucune vérification ici, pour ne rien afficher dans la console du navigateur.

// Aucun message Firebase dans la console du navigateur : les erreurs sont présentées dans la page.
setLogLevel('silent')

// En dev uniquement, App Check utilise un jeton de debug fixe lu dans .env.development.local
// (fichier jamais chargé au build, donc jamais publié). Le SDK l'affiche dans la console en dev :
// accepté, la règle « rien dans la console » ne vise que le site publié.
// Sans jeton, App Check passe par reCAPTCHA (localhost déclaré dans la clé).
// import.meta.env.DEV écrit en toutes lettres : Vite remplace la condition par false au build et
// supprime le bloc, ce qui garantit que le jeton ne peut pas finir dans le site publié.
if (import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN
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
